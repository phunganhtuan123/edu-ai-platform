package pipelines

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Module 2 — sinh đề THPT đúng format thi (spec mục 2a).
//
// NGUYÊN TẮC: FORMAT DO CODE QUYẾT ĐỊNH, NỘI DUNG DO MODEL (kế thừa thpt.py).
// Model không bao giờ được biết số câu trong đề, không tự đánh số, không tự
// chọn vị trí đáp án — code làm hết những việc đó.

// ExamInput là input job của module 2.
type ExamInput struct {
	// Parts là danh sách mã phần thi cần sinh, theo bảng ExamParts.
	// Giáo viên chọn nhiều phần trong một lần chạy; code giữ số câu liên tục
	// từ phần này sang phần kia.
	Parts  []string       `json:"parts"`
	Counts map[string]int `json:"counts"` // tuỳ chọn: ghi đè số câu từng phần

	Topic       string `json:"topic"`
	SourceText  string `json:"source_text"`
	SourceMode  string `json:"source_mode"` // keep | rewrite (spec mục 2c)
	Difficulty  string `json:"difficulty"`  // easy | medium | hard
	GradeLevel  string `json:"grade_level"`
	StartNumber int    `json:"start_number"`

	// Section là input CŨ (trước spec 1.2), giữ để job đã lưu chạy lại được.
	Section string `json:"section"`
}

const (
	SourceModeKeep    = "keep"
	SourceModeRewrite = "rewrite"
)

func normalizeSourceMode(m string) string {
	if strings.ToLower(strings.TrimSpace(m)) == SourceModeRewrite {
		return SourceModeRewrite
	}
	return SourceModeKeep
}

// ExamItem là một câu đã chuẩn hoá, dùng chung cho cả ba kind.
type ExamItem struct {
	BlankNumber   int      `json:"blank_number"`
	ExamNumber    int      `json:"exam_number"`
	Prompt        string   `json:"prompt,omitempty"` // câu hỏi (reading/ordering)
	Options       []string `json:"options"`
	AnswerIndex   int      `json:"answer_index"`
	CorrectOption string   `json:"correct_option"`
	TestedPoint   string   `json:"tested_point,omitempty"`
	Explanation   string   `json:"explanation,omitempty"`
}

type rawExamItem struct {
	BlankNumber   int      `json:"blank_number"`
	Options       []string `json:"options"`
	CorrectOption string   `json:"correct_option"`
	TestedPoint   string   `json:"tested_point"`
}

// stimulusDescription mô tả loại ngữ liệu cho prompt.
var stimulusDescription = map[string]string{
	"notice":        "school/community NOTICE (announcement)",
	"lexical":       "short informational text (an email, a message-board post, or a short article)",
	"reading":       "short article or report",
	"leaflet":       "LEAFLET or advertisement (for a service, event, club, or product)",
	"leaflet_cloze": "LEAFLET or advertisement (for a service, event, club, or product)",
	"academic":      "academic-style passage (science, history, or a social issue)",
}

// Câu lệnh đề — giữ nguyên văn phong đề thi, do code sinh, không hỏi model.
const (
	clozeInstruction = "Read the following %s and mark the letter A, B, C, or D on your " +
		"answer sheet to indicate the option that best fits each of the numbered blanks " +
		"from %d to %d."
	readingInstruction = "Read the following %s and mark the letter A, B, C, or D on your " +
		"answer sheet to indicate the correct answer to each of the questions from %d to %d."
	orderingInstruction = "Mark the letter A, B, C, or D on your answer sheet to indicate the " +
		"correct arrangement of the sentences to make a meaningful exchange in each of the " +
		"following questions from %d to %d."
)

var blankRe = regexp.MustCompile(`\((\d+)\)_+`)

// sourceInstruction dựng phần chỉ dẫn ngữ liệu cho user prompt theo
// source_mode (spec mục 2c).
func sourceInstruction(in ExamInput, docDesc string) string {
	src := strings.TrimSpace(in.SourceText)
	topic := strings.TrimSpace(in.Topic)
	if src == "" {
		return fmt.Sprintf("Topic of the %s: %s", docDesc, topic)
	}
	if normalizeSourceMode(in.SourceMode) == SourceModeRewrite {
		return fmt.Sprintf(
			"Write a NEW %s on the same theme as the text below. Do NOT copy its sentences; "+
				"keep roughly the same length and topic.\n\n--- SOURCE TEXT ---\n%s",
			docDesc, src)
	}
	return fmt.Sprintf(
		"Use the text below AS THE PASSAGE, keeping its wording. Adapt it only as much as the "+
			"exam format requires.\n\n--- SOURCE TEXT ---\n%s", src)
}

// runExam sinh lần lượt từng phần đã chọn, giữ số câu liên tục, và báo tiến
// độ theo từng phần (UI không được để thanh chạy câm khi model local mất
// nhiều phút mỗi phần).
func runExam(client ollamaChatter, model string, input json.RawMessage, progress ProgressFunc) (*Result, error) {
	var in ExamInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input exam không hợp lệ: %w", err)
	}
	in.Difficulty = NormalizeDifficulty(in.Difficulty)
	in.SourceMode = normalizeSourceMode(in.SourceMode)

	// Tương thích ngược: input cũ chỉ có {"section": "notice"|"leaflet"}.
	ids := in.Parts
	if len(ids) == 0 && strings.TrimSpace(in.Section) != "" {
		ids = []string{strings.TrimSpace(in.Section)}
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("chưa chọn phần thi nào (parts rỗng)")
	}

	parts := make([]ExamPart, 0, len(ids))
	for _, id := range ids {
		p, ok := FindExamPart(id)
		if !ok {
			return nil, fmt.Errorf("phần thi không hợp lệ: %q", id)
		}
		parts = append(parts, p)
	}
	if strings.TrimSpace(in.Topic) == "" && strings.TrimSpace(in.SourceText) == "" {
		return nil, fmt.Errorf("cần chủ đề (topic) hoặc văn bản nguồn (source_text)")
	}

	num := in.StartNumber
	if num <= 0 {
		num = 1
	}

	var (
		sections    []map[string]any
		allWarnings []string
		names       []string
	)
	for i, p := range parts {
		if progress != nil {
			progress(i+1, len(parts), "Đang soạn "+p.NameVi)
		}
		count := p.DefaultCount
		if c, ok := in.Counts[p.ID]; ok && c > 0 {
			count = c
		}
		if !p.CountConfirmed {
			allWarnings = append(allWarnings, fmt.Sprintf(
				"%s: số câu (%d) CHƯA đối chiếu đề minh hoạ Bộ GD&ĐT 2/2025 — kiểm tra lại trước khi dùng thật.",
				p.NameVi, count))
		}

		var (
			sec  map[string]any
			used int
			ws   []string
			err  error
		)
		switch p.Kind {
		case KindCloze:
			sec, used, ws, err = genCloze(client, model, p, in, count, num)
		case KindOrdering:
			sec, used, ws, err = genOrdering(client, model, p, in, count, num)
		case KindReading:
			sec, used, ws, err = genReading(client, model, p, in, count, num)
		default:
			err = fmt.Errorf("kind không hỗ trợ: %s", p.Kind)
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %w", p.NameVi, err)
		}
		for _, w := range ws {
			allWarnings = append(allWarnings, p.NameVi+": "+w)
		}
		sections = append(sections, sec)
		names = append(names, p.NameVi)
		num += used
	}

	end := num - 1
	content, err := toContent(map[string]any{
		"parts":        sections,
		"difficulty":   in.Difficulty,
		"source_mode":  in.SourceMode,
		"grade_level":  in.GradeLevel,
		"topic":        in.Topic,
		"start_number": in.StartNumber,
		"end_number":   end,
	})
	if err != nil {
		return nil, err
	}
	title := fmt.Sprintf("Đề THPT — %d phần, câu %d–%d", len(sections), maxInt(in.StartNumber, 1), end)
	if len(sections) == 1 {
		title = fmt.Sprintf("%s — câu %d–%d", names[0], maxInt(in.StartNumber, 1), end)
	}
	return &Result{Title: title, Content: content, Warnings: allWarnings}, nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// ---------------------------------------------------------------- CLOZE ----

const clozeSystemPrompt = `You are an English test item writer for the Vietnamese national high school graduation exam (THPT 2025 format).
Task: write ONE short %s of 80-110 words about the given topic, containing exactly %d numbered blanks written EXACTLY as (1)_____, (2)_____, ... (parentheses, number, five underscores).

Rules:
- Each blank tests ONE point suitable for the exam: word form, preposition, determiner, phrasal verb, relative/reduced clause, or context vocabulary. Vary the tested points.
- For each blank give 4 options (content only, no letter prefixes). Distractors must be plausible.
- correct_option: copy EXACTLY one of the 4 options.
- tested_point: name the grammar/vocab point in Vietnamese (e.g. "giới từ", "dạng từ").
- %s
- Do not number blanks other than (1)..(%d).`

func clozeSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title": map[string]any{"type": "string"},
			"passage": map[string]any{
				"type":        "string",
				"description": "Text with blanks marked exactly as (1)_____, (2)_____ ...",
			},
			"items": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"blank_number": map[string]any{"type": "integer"},
						"options": map[string]any{
							"type": "array", "items": map[string]any{"type": "string"},
							"minItems": 4, "maxItems": 4,
						},
						"correct_option": map[string]any{"type": "string"},
						"tested_point":   map[string]any{"type": "string"},
					},
					"required": []string{"blank_number", "options", "correct_option", "tested_point"},
				},
			},
		},
		"required": []string{"title", "passage", "items"},
	}
}

func genCloze(client ollamaChatter, model string, p ExamPart, in ExamInput, count, startNum int) (map[string]any, int, []string, error) {
	doc := stimulusDescription[p.Stimulus]
	system := fmt.Sprintf(clozeSystemPrompt, doc, count, difficultyPrompt(p, in.Difficulty), count)
	user := sourceInstruction(in, doc)

	out, err := client.ChatStructured(model, system, user, clozeSchema())
	if err != nil {
		return nil, 0, nil, err
	}
	var raw struct {
		Title   string        `json:"title"`
		Passage string        `json:"passage"`
		Items   []rawExamItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return nil, 0, nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}

	items, warnings := validateExam(raw.Passage, raw.Items, count)
	warnings = append(warnings, checkDifficulty(raw.Passage, in.Difficulty)...)
	passage, items := renumberExam(raw.Passage, items, startNum)

	end := startNum + len(items) - 1
	sec := map[string]any{
		"part_id":      p.ID,
		"part_name":    p.NameVi,
		"kind":         string(p.Kind),
		"title":        raw.Title,
		"passage":      passage,
		"instruction":  fmt.Sprintf(clozeInstruction, doc, startNum, end),
		"items":        items,
		"start_number": startNum,
		"end_number":   end,
	}
	return sec, len(items), warnings, nil
}

// -------------------------------------------------------------- READING ----

const readingSystemPrompt = `You are an English test item writer for the Vietnamese national high school graduation exam (THPT 2025 format).
Task: produce ONE %s and exactly %d multiple-choice comprehension questions about it.

Rules:
- The passage must contain all the information needed to answer every question. No outside knowledge.
- Vary the question types: main idea, specific detail, vocabulary in context, reference, inference.
- For each question give 4 options (content only, no letter prefixes). Distractors must be plausible and clearly wrong on a careful reading.
- correct_option: copy EXACTLY one of the 4 options.
- explanation: one short sentence IN VIETNAMESE saying why that option is right.
- %s`

func readingSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title":   map[string]any{"type": "string"},
			"passage": map[string]any{"type": "string"},
			"questions": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"question": map[string]any{"type": "string"},
						"options": map[string]any{
							"type": "array", "items": map[string]any{"type": "string"},
							"minItems": 4, "maxItems": 4,
						},
						"correct_option": map[string]any{"type": "string"},
						"explanation":    map[string]any{"type": "string"},
					},
					"required": []string{"question", "options", "correct_option", "explanation"},
				},
			},
		},
		"required": []string{"title", "passage", "questions"},
	}
}

func genReading(client ollamaChatter, model string, p ExamPart, in ExamInput, count, startNum int) (map[string]any, int, []string, error) {
	doc := stimulusDescription[p.Stimulus]
	system := fmt.Sprintf(readingSystemPrompt, doc, count, difficultyPrompt(p, in.Difficulty))
	user := sourceInstruction(in, doc)

	out, err := client.ChatStructured(model, system, user, readingSchema())
	if err != nil {
		return nil, 0, nil, err
	}
	var raw struct {
		Title     string `json:"title"`
		Passage   string `json:"passage"`
		Questions []struct {
			Question      string   `json:"question"`
			Options       []string `json:"options"`
			CorrectOption string   `json:"correct_option"`
			Explanation   string   `json:"explanation"`
		} `json:"questions"`
	}
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return nil, 0, nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}

	var warnings []string
	if len(raw.Questions) != count {
		warnings = append(warnings, fmt.Sprintf("Số câu hỏi = %d, cần %d", len(raw.Questions), count))
	}
	warnings = append(warnings, checkDifficulty(raw.Passage, in.Difficulty)...)

	items := make([]ExamItem, 0, len(raw.Questions))
	for i, q := range raw.Questions {
		opts := make([]string, 0, len(q.Options))
		for _, o := range q.Options {
			opts = append(opts, cleanOption(o))
		}
		correct := cleanOption(q.CorrectOption)
		idx := matchOptionIndex(opts, correct)
		if idx < 0 {
			warnings = append(warnings, fmt.Sprintf("Câu %d: correct_option không khớp options", i+1))
			idx = 0
		}
		if len(opts) != 4 || hasDuplicateOptions(opts) {
			warnings = append(warnings, fmt.Sprintf("Câu %d: options trùng nhau hoặc không đủ 4", i+1))
		}
		// Vị trí đáp án do CODE xáo, không để model quyết.
		opts, idx = shuffleOptions(opts, idx)
		items = append(items, ExamItem{
			ExamNumber:    startNum + i,
			Prompt:        strings.TrimSpace(q.Question),
			Options:       opts,
			AnswerIndex:   idx,
			CorrectOption: correct,
			Explanation:   strings.TrimSpace(q.Explanation),
		})
	}

	end := startNum + len(items) - 1
	sec := map[string]any{
		"part_id":      p.ID,
		"part_name":    p.NameVi,
		"kind":         string(p.Kind),
		"title":        raw.Title,
		"passage":      strings.TrimSpace(raw.Passage),
		"instruction":  fmt.Sprintf(readingInstruction, doc, startNum, end),
		"items":        items,
		"start_number": startNum,
		"end_number":   end,
	}
	return sec, len(items), warnings, nil
}

// ------------------------------------------------------------- ORDERING ----

const orderingSystemPrompt = `You are an English test item writer for the Vietnamese national high school graduation exam (THPT 2025 format).
Task: write exactly %d independent items. Each item is a short exchange or mini-paragraph broken into 4 sentences given OUT OF ORDER.

Rules:
- For each item give the 4 sentences as plain strings in the array "sentences", in a scrambled order.
- "correct_order" is an array of the 4 one-based indexes into "sentences" giving the ONLY coherent order.
- Cohesion must be decidable from linkers, pronouns and reference words — not from guessing.
- Do NOT label the sentences with a, b, c, d and do NOT provide answer options; the exam options are built separately.
- %s`

func orderingSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"items": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"sentences": map[string]any{
							"type": "array", "items": map[string]any{"type": "string"},
							"minItems": 4, "maxItems": 4,
						},
						"correct_order": map[string]any{
							"type": "array", "items": map[string]any{"type": "integer"},
							"minItems": 4, "maxItems": 4,
						},
						"explanation": map[string]any{"type": "string"},
					},
					"required": []string{"sentences", "correct_order"},
				},
			},
		},
		"required": []string{"items"},
	}
}

var orderLabels = []string{"a", "b", "c", "d"}

func genOrdering(client ollamaChatter, model string, p ExamPart, in ExamInput, count, startNum int) (map[string]any, int, []string, error) {
	system := fmt.Sprintf(orderingSystemPrompt, count, difficultyPrompt(p, in.Difficulty))
	user := sourceInstruction(in, "set of short exchanges")

	out, err := client.ChatStructured(model, system, user, orderingSchema())
	if err != nil {
		return nil, 0, nil, err
	}
	var raw struct {
		Items []struct {
			Sentences    []string `json:"sentences"`
			CorrectOrder []int    `json:"correct_order"`
			Explanation  string   `json:"explanation"`
		} `json:"items"`
	}
	if err := json.Unmarshal([]byte(out), &raw); err != nil {
		return nil, 0, nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}

	var warnings []string
	if len(raw.Items) != count {
		warnings = append(warnings, fmt.Sprintf("Số câu = %d, cần %d", len(raw.Items), count))
	}

	items := make([]ExamItem, 0, len(raw.Items))
	sentenceSets := make([]map[string]any, 0, len(raw.Items))
	for i, it := range raw.Items {
		if len(it.Sentences) != 4 || !validPermutation(it.CorrectOrder) {
			warnings = append(warnings, fmt.Sprintf("Câu %d: thiếu câu hoặc correct_order không phải hoán vị của 1..4 — bỏ qua", i+1))
			continue
		}
		// PHƯƠNG ÁN NHIỄU DO CODE SINH: 3 hoán vị khác, không hỏi model.
		correct := orderToLabels(it.CorrectOrder)
		opts := []string{correct}
		for _, alt := range distractorOrders(it.CorrectOrder) {
			opts = append(opts, orderToLabels(alt))
		}
		opts, idx := shuffleOptions(opts, 0)

		labelled := make([]string, 0, 4)
		for j, s := range it.Sentences {
			labelled = append(labelled, orderLabels[j]+". "+strings.TrimSpace(s))
		}
		sentenceSets = append(sentenceSets, map[string]any{
			"exam_number": startNum + len(items),
			"sentences":   labelled,
		})
		items = append(items, ExamItem{
			ExamNumber:    startNum + len(items),
			Prompt:        strings.Join(labelled, "\n"),
			Options:       opts,
			AnswerIndex:   idx,
			CorrectOption: correct,
			Explanation:   strings.TrimSpace(it.Explanation),
		})
	}

	end := startNum + len(items) - 1
	sec := map[string]any{
		"part_id":       p.ID,
		"part_name":     p.NameVi,
		"kind":          string(p.Kind),
		"instruction":   fmt.Sprintf(orderingInstruction, startNum, end),
		"items":         items,
		"sentence_sets": sentenceSets,
		"start_number":  startNum,
		"end_number":    end,
	}
	return sec, len(items), warnings, nil
}

// validPermutation kiểm correct_order đúng là hoán vị của 1..4.
func validPermutation(order []int) bool {
	if len(order) != 4 {
		return false
	}
	seen := map[int]bool{}
	for _, v := range order {
		if v < 1 || v > 4 || seen[v] {
			return false
		}
		seen[v] = true
	}
	return true
}

func orderToLabels(order []int) string {
	parts := make([]string, 0, len(order))
	for _, v := range order {
		parts = append(parts, orderLabels[v-1])
	}
	return strings.Join(parts, " - ")
}

// distractorOrders sinh 3 hoán vị nhiễu khác hoán vị đúng, ưu tiên những
// hoán vị "gần đúng" (đổi chỗ hai câu) để nhiễu có sức đánh lừa.
func distractorOrders(correct []int) [][]int {
	var cands [][]int
	for i := 0; i < 4; i++ {
		for j := i + 1; j < 4; j++ {
			c := append([]int(nil), correct...)
			c[i], c[j] = c[j], c[i]
			cands = append(cands, c)
		}
	}
	rand.Shuffle(len(cands), func(i, j int) { cands[i], cands[j] = cands[j], cands[i] })
	if len(cands) > 3 {
		cands = cands[:3]
	}
	return cands
}

// shuffleOptions xáo vị trí phương án bằng code và trả về chỉ số đáp án mới.
func shuffleOptions(opts []string, answer int) ([]string, int) {
	idx := make([]int, len(opts))
	for i := range idx {
		idx[i] = i
	}
	rand.Shuffle(len(idx), func(i, j int) { idx[i], idx[j] = idx[j], idx[i] })
	out := make([]string, len(opts))
	newAnswer := 0
	for pos, old := range idx {
		out[pos] = opts[old]
		if old == answer {
			newAnswer = pos
		}
	}
	return out, newAnswer
}

// ------------------------------------------------------------ VALIDATORS ---

// validateExam ports thpt.py validate_notice: mọi ràng buộc format đều do code
// kiểm, không tin model.
func validateExam(passage string, raw []rawExamItem, n int) ([]ExamItem, []string) {
	var warnings []string

	counts := map[int]int{}
	for _, m := range blankRe.FindAllStringSubmatch(passage, -1) {
		k, _ := strconv.Atoi(m[1])
		counts[k]++
	}
	for k := 1; k <= n; k++ {
		if counts[k] != 1 {
			warnings = append(warnings, fmt.Sprintf("Blank (%d) xuất hiện %d lần trong đoạn văn (phải đúng 1)", k, counts[k]))
		}
	}
	var extra []int
	for k := range counts {
		if k < 1 || k > n {
			extra = append(extra, k)
		}
	}
	if len(extra) > 0 {
		sort.Ints(extra)
		warnings = append(warnings, fmt.Sprintf("Đoạn văn có blank thừa: %v", extra))
	}
	if len(raw) != n {
		warnings = append(warnings, fmt.Sprintf("Số item = %d, cần %d", len(raw), n))
	}

	items := make([]ExamItem, 0, len(raw))
	for _, it := range raw {
		opts := make([]string, 0, len(it.Options))
		for _, o := range it.Options {
			opts = append(opts, cleanOption(o))
		}
		correct := cleanOption(it.CorrectOption)
		idx := matchOptionIndex(opts, correct)
		if idx < 0 {
			warnings = append(warnings, fmt.Sprintf("Blank (%d): correct_option không khớp options", it.BlankNumber))
			idx = 0
		}
		if len(opts) != 4 || hasDuplicateOptions(opts) {
			warnings = append(warnings, fmt.Sprintf("Blank (%d): options trùng nhau hoặc không đủ 4", it.BlankNumber))
		}
		items = append(items, ExamItem{
			BlankNumber:   it.BlankNumber,
			Options:       opts,
			AnswerIndex:   idx,
			CorrectOption: correct,
			TestedPoint:   it.TestedPoint,
		})
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].BlankNumber < items[j].BlankNumber })
	return items, warnings
}

// renumberExam ports thpt.py renumber: đánh số câu liên tục theo vị trí phần
// trong đề — code làm, model không bao giờ biết.
func renumberExam(passage string, items []ExamItem, startNum int) (string, []ExamItem) {
	mapping := make(map[int]int, len(items))
	for i := range items {
		mapping[items[i].BlankNumber] = startNum + i
	}
	olds := make([]int, 0, len(mapping))
	for old := range mapping {
		olds = append(olds, old)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(olds)))
	for _, old := range olds {
		re := regexp.MustCompile(`\(` + strconv.Itoa(old) + `\)(_+)`)
		passage = re.ReplaceAllString(passage, fmt.Sprintf("(%d)", mapping[old])+"$1")
	}
	for i := range items {
		items[i].ExamNumber = mapping[items[i].BlankNumber]
	}
	return passage, items
}
