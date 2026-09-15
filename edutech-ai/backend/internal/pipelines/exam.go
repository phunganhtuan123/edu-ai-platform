package pipelines

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ExamInput is the job input for the exam pipeline (THPT 2025 format
// sections, MVP: notice + leaflet cloze, 6 blanks each).
type ExamInput struct {
	Section     string `json:"section"` // "notice" | "leaflet"
	Topic       string `json:"topic"`
	GradeLevel  string `json:"grade_level"`
	StartNumber int    `json:"start_number"`
}

// ExamItem is one normalized cloze item.
type ExamItem struct {
	BlankNumber   int      `json:"blank_number"`
	ExamNumber    int      `json:"exam_number"`
	Options       []string `json:"options"`
	AnswerIndex   int      `json:"answer_index"`
	CorrectOption string   `json:"correct_option"`
	TestedPoint   string   `json:"tested_point"`
}

type rawExamItem struct {
	BlankNumber   int      `json:"blank_number"`
	Options       []string `json:"options"`
	CorrectOption string   `json:"correct_option"`
	TestedPoint   string   `json:"tested_point"`
}

// FORMAT IS OWNED BY CODE, CONTENT BY THE MODEL (thpt.py philosophy).
// examSections mirrors thpt.py EXAM_STRUCTURE for the MVP sections.
var examSections = map[string]struct {
	NameVi  string
	DocType string // word used in the standard instruction line
	Count   int
}{
	"notice":  {NameVi: "Điền từ vào thông báo", DocType: "notice", Count: 6},
	"leaflet": {NameVi: "Điền từ vào tờ rơi/quảng cáo", DocType: "leaflet", Count: 6},
}

// clozeInstruction is the standard exam instruction line, EXACTLY as in
// thpt.py CLOZE_INSTRUCTION ({doc_type}/{start}/{end} become %s/%d/%d).
const clozeInstruction = "Read the following %s and mark the letter A, B, C, or D on your " +
	"answer sheet to indicate the option that best fits each of the numbered blanks " +
	"from %d to %d."

// examSystemPrompt ports thpt.py SYSTEM_PROMPT, parameterized on the document
// kind (%s = document description, %d = number of blanks, %d again in the
// last rule).
const examSystemPrompt = `You are an English test item writer for the Vietnamese national high school graduation exam (THPT 2025 format).
Task: write ONE short %s of 80-110 words about the given topic, containing exactly %d numbered blanks written EXACTLY as (1)_____, (2)_____, ... (parentheses, number, five underscores).

Rules:
- Each blank tests ONE point suitable for the exam: word form, preposition, determiner, phrasal verb, relative/reduced clause, or context vocabulary. Vary the tested points.
- For each blank give 4 options (content only, no letter prefixes). Distractors must be plausible.
- correct_option: copy EXACTLY one of the 4 options.
- tested_point: name the grammar/vocab point in Vietnamese (e.g. "giới từ", "dạng từ").
- CEFR level around B1. Do not number blanks other than (1)..(%d).`

var examDocDescription = map[string]string{
	"notice":  "school/community NOTICE (announcement)",
	"leaflet": "LEAFLET or advertisement (for a service, event, club, or product)",
}

// examSchema ports thpt.py NOTICE_SCHEMA (shared by both cloze sections).
func examSchema() map[string]any {
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
							"type":     "array",
							"items":    map[string]any{"type": "string"},
							"minItems": 4,
							"maxItems": 4,
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

var blankRe = regexp.MustCompile(`\((\d+)\)_+`)

func runExam(client ollamaChatter, model string, input json.RawMessage) (*Result, error) {
	var in ExamInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input exam không hợp lệ: %w", err)
	}
	section, ok := examSections[in.Section]
	if !ok {
		return nil, fmt.Errorf("dạng bài không hỗ trợ: %q (MVP: notice, leaflet)", in.Section)
	}
	if strings.TrimSpace(in.Topic) == "" {
		return nil, fmt.Errorf("thiếu chủ đề (topic)")
	}
	if in.StartNumber <= 0 {
		in.StartNumber = 1
	}
	n := section.Count

	system := fmt.Sprintf(examSystemPrompt, examDocDescription[in.Section], n, n)
	user := fmt.Sprintf("Topic of the %s: %s", section.DocType, strings.TrimSpace(in.Topic))

	content, err := client.ChatStructured(model, system, user, examSchema())
	if err != nil {
		return nil, err
	}

	var raw struct {
		Title   string        `json:"title"`
		Passage string        `json:"passage"`
		Items   []rawExamItem `json:"items"`
	}
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}

	items, warnings := validateExam(raw.Passage, raw.Items, n)
	passage, items := renumberExam(raw.Passage, items, in.StartNumber)

	end := in.StartNumber + len(items) - 1
	instruction := fmt.Sprintf(clozeInstruction, section.DocType, in.StartNumber, end)

	c, err := toContent(map[string]any{
		"section":      in.Section,
		"section_name": section.NameVi,
		"title":        raw.Title,
		"passage":      passage,
		"instruction":  instruction,
		"items":        items,
		"start_number": in.StartNumber,
		"end_number":   end,
		"grade_level":  in.GradeLevel,
		"topic":        in.Topic,
	})
	if err != nil {
		return nil, err
	}
	return &Result{
		Title:    fmt.Sprintf("%s — câu %d–%d", section.NameVi, in.StartNumber, end),
		Content:  c,
		Warnings: warnings,
	}, nil
}

// validateExam ports thpt.py validate_notice: every format constraint is
// checked by code, none trusted to the model.
func validateExam(passage string, raw []rawExamItem, n int) ([]ExamItem, []string) {
	var warnings []string

	// Each blank (1)..(n) must appear exactly once in the passage.
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
			opts = append(opts, strings.TrimSpace(o))
		}
		correct := strings.TrimSpace(it.CorrectOption)
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

// renumberExam ports thpt.py renumber: continuous question numbering by the
// section's position within the 40-question paper — done by code, the model
// never knows about it.
func renumberExam(passage string, items []ExamItem, startNum int) (string, []ExamItem) {
	mapping := make(map[int]int, len(items))
	for i := range items {
		mapping[items[i].BlankNumber] = startNum + i
	}
	// Replace in descending order of old number to avoid collisions
	// (e.g. renumbering (1)->(2) before (2)->(3) would corrupt the passage).
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
