package pipelines

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Module 5 — Nhân đề theo mẫu (spec mục 2, module 5).
//
// Chạy hai bước tách rời, KHÔNG gộp làm một:
//   template_analyze  — model đọc bài mẫu, mô tả CẤU TRÚC ra JSON (nhanh)
//                       -> giáo viên xem và sửa bản mô tả
//   template_generate — code dựng lại khung từ bản mô tả đã duyệt,
//                       model chỉ điền nội dung theo từ vựng/ngữ pháp mới
//
// Tách hai bước vì bước 1 chạy vài giây còn bước 2 mất vài phút: nếu model
// đọc sai cấu trúc mẫu, giáo viên sửa ngay ở bước 1 thay vì chờ hết bước 2
// rồi mới phát hiện cả bộ đề sai khung.

// TemplateSectionKind — các dạng phần mà module 5 dựng lại được.
const (
	TplCloze    = "cloze"    // đoạn văn có chỗ trống đánh số
	TplReading  = "reading"  // đoạn văn + câu hỏi trắc nghiệm
	TplOrdering = "ordering" // sắp xếp câu
	TplMCQ      = "mcq"      // câu trắc nghiệm rời, không có đoạn văn
)

var tplKindNameVi = map[string]string{
	TplCloze:    "Điền từ vào đoạn",
	TplReading:  "Đọc hiểu",
	TplOrdering: "Sắp xếp câu",
	TplMCQ:      "Trắc nghiệm rời",
}

// TemplateSection là một phần trong bản mô tả cấu trúc.
type TemplateSection struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Count      int    `json:"count"`
	HasPassage bool   `json:"has_passage"`
	Notes      string `json:"notes"`
}

// TemplateSpec là bản mô tả cấu trúc bài mẫu — thứ giáo viên duyệt giữa hai bước.
type TemplateSpec struct {
	Title    string            `json:"title"`
	Sections []TemplateSection `json:"sections"`
}

type TemplateAnalyzeInput struct {
	SampleText string `json:"sample_text"`
}

type TemplateGenerateInput struct {
	Spec           TemplateSpec `json:"spec"`
	Topic          string       `json:"topic"`
	Vocabulary     string       `json:"vocabulary"`
	Grammar        string       `json:"grammar"`
	Difficulty     string       `json:"difficulty"`
	WithTranscript bool         `json:"with_transcript"`
}

// --------------------------------------------------------- BƯỚC 1: PHÂN TÍCH

const templateAnalyzeSystem = `You are analysing the STRUCTURE of an English exercise sheet so it can be regenerated with new content.
Do NOT solve it, do NOT rewrite it, do NOT invent extra parts. Describe only what is actually there.

For each part of the sheet output:
- name: a short Vietnamese label for the part (e.g. "Điền từ vào đoạn văn").
- kind: EXACTLY one of "cloze" (a passage with numbered blanks), "reading" (a passage followed by comprehension questions), "ordering" (sentences to put in order), "mcq" (standalone multiple-choice sentences with no shared passage).
- count: how many questions that part actually has.
- has_passage: true if the part has a shared passage or dialogue.
- notes: in Vietnamese, what the part tests (grammar points, topic, register). One short sentence.

If a part does not fit any of the four kinds, use the closest one and say so in notes.`

func templateAnalyzeSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title": map[string]any{"type": "string"},
			"sections": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"name":        map[string]any{"type": "string"},
						"kind":        map[string]any{"type": "string", "enum": []string{TplCloze, TplReading, TplOrdering, TplMCQ}},
						"count":       map[string]any{"type": "integer"},
						"has_passage": map[string]any{"type": "boolean"},
						"notes":       map[string]any{"type": "string"},
					},
					"required": []string{"name", "kind", "count", "has_passage", "notes"},
				},
			},
		},
		"required": []string{"title", "sections"},
	}
}

func runTemplateAnalyze(client ollamaChatter, model string, input json.RawMessage) (*Result, error) {
	var in TemplateAnalyzeInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input không hợp lệ: %w", err)
	}
	sample := strings.TrimSpace(in.SampleText)
	if sample == "" {
		return nil, fmt.Errorf("chưa dán bài tập mẫu")
	}

	out, err := client.ChatStructured(model, templateAnalyzeSystem,
		"--- SAMPLE EXERCISE SHEET ---\n"+sample, templateAnalyzeSchema())
	if err != nil {
		return nil, err
	}
	var spec TemplateSpec
	if err := json.Unmarshal([]byte(out), &spec); err != nil {
		return nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}

	spec, warnings := normalizeTemplateSpec(spec)
	if len(spec.Sections) == 0 {
		return nil, fmt.Errorf("không nhận ra phần nào trong bài mẫu — kiểm tra lại văn bản đã dán")
	}

	content, err := toContent(map[string]any{
		"spec":        spec,
		"sample_text": sample,
	})
	if err != nil {
		return nil, err
	}
	return &Result{
		Title:    "Cấu trúc bài mẫu: " + spec.Title,
		Content:  content,
		Warnings: warnings,
	}, nil
}

// normalizeTemplateSpec sửa những gì code sửa được và cảnh báo phần còn lại.
// Bản mô tả này giáo viên sẽ duyệt, nên thà cảnh báo thừa còn hơn im lặng.
func normalizeTemplateSpec(spec TemplateSpec) (TemplateSpec, []string) {
	var warnings []string
	out := make([]TemplateSection, 0, len(spec.Sections))
	for i, s := range spec.Sections {
		label := strings.TrimSpace(s.Name)
		if label == "" {
			label = fmt.Sprintf("Phần %d", i+1)
		}
		kind := strings.ToLower(strings.TrimSpace(s.Kind))
		if _, ok := tplKindNameVi[kind]; !ok {
			warnings = append(warnings, fmt.Sprintf(
				"%s: dạng bài %q không nhận ra, tạm coi là trắc nghiệm rời — sửa lại nếu sai.", label, s.Kind))
			kind = TplMCQ
		}
		count := s.Count
		if count < 1 {
			warnings = append(warnings, fmt.Sprintf("%s: không đọc được số câu, tạm để 5 — sửa lại cho đúng mẫu.", label))
			count = 5
		}
		if count > 30 {
			warnings = append(warnings, fmt.Sprintf("%s: %d câu là nhiều bất thường, cắt còn 30.", label, count))
			count = 30
		}
		hasPassage := s.HasPassage
		if kind == TplCloze || kind == TplReading {
			hasPassage = true // hai dạng này bắt buộc có đoạn văn
		}
		out = append(out, TemplateSection{
			Name: label, Kind: kind, Count: count,
			HasPassage: hasPassage, Notes: strings.TrimSpace(s.Notes),
		})
	}
	title := strings.TrimSpace(spec.Title)
	if title == "" {
		title = "Bài tập"
	}
	return TemplateSpec{Title: title, Sections: out}, warnings
}

// ----------------------------------------------------------- BƯỚC 2: SINH

func runTemplateGenerate(client ollamaChatter, model string, input json.RawMessage, progress ProgressFunc) (*Result, error) {
	var in TemplateGenerateInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input không hợp lệ: %w", err)
	}
	spec, warnings := normalizeTemplateSpec(in.Spec)
	if len(spec.Sections) == 0 {
		return nil, fmt.Errorf("bản mô tả cấu trúc rỗng — chạy lại bước phân tích")
	}
	in.Difficulty = NormalizeDifficulty(in.Difficulty)

	material := templateMaterial(in)
	if material == "" {
		return nil, fmt.Errorf("cần ít nhất một trong: chủ đề, từ vựng mới, hoặc cấu trúc ngữ pháp mới")
	}

	num := 1
	var sections []map[string]any
	for i, s := range spec.Sections {
		if progress != nil {
			progress(i+1, len(spec.Sections), "Đang soạn "+s.Name)
		}
		// Dựng một "phần thi" tạm để dùng lại đúng bộ generator và validator
		// của module 2 — không viết lại logic lần hai.
		part := ExamPart{
			ID:       fmt.Sprintf("tpl_%d_%s", i+1, s.Kind),
			NameVi:   s.Name,
			CEFR:     difficultyByKey(in.Difficulty).CEFR,
			Stimulus: "lexical",
		}
		examIn := ExamInput{
			Topic:      material,
			SourceMode: SourceModeRewrite,
			Difficulty: in.Difficulty,
		}
		if in.WithTranscript && s.HasPassage {
			examIn.Topic = material + "\nWrite the passage as a SPOKEN LISTENING TRANSCRIPT (natural speech, speaker turns if it is a dialogue)."
		}

		var (
			sec  map[string]any
			used int
			ws   []string
			err  error
		)
		switch s.Kind {
		case TplCloze:
			part.Kind = KindCloze
			sec, used, ws, err = genCloze(client, model, part, examIn, s.Count, num)
		case TplReading:
			part.Kind = KindReading
			sec, used, ws, err = genReading(client, model, part, examIn, s.Count, num)
		case TplOrdering:
			part.Kind = KindOrdering
			sec, used, ws, err = genOrdering(client, model, part, examIn, s.Count, num)
		default:
			part.Kind = KindReading // chỉ để hiển thị; generator riêng bên dưới
			sec, used, ws, err = genStandaloneMCQ(client, model, part, examIn, s.Count, num)
		}
		if err != nil {
			return nil, fmt.Errorf("%s: %w", s.Name, err)
		}
		sec["kind"] = s.Kind
		sec["part_name"] = s.Name
		sec["notes"] = s.Notes
		sec["is_transcript"] = in.WithTranscript && s.HasPassage
		for _, w := range ws {
			warnings = append(warnings, s.Name+": "+w)
		}
		sections = append(sections, sec)
		num += used
	}

	content, err := toContent(map[string]any{
		"parts":        sections,
		"spec":         spec,
		"difficulty":   in.Difficulty,
		"source_mode":  SourceModeRewrite,
		"start_number": 1,
		"end_number":   num - 1,
	})
	if err != nil {
		return nil, err
	}
	return &Result{
		Title:    fmt.Sprintf("%s (bản mới) — %d câu", spec.Title, num-1),
		Content:  content,
		Warnings: warnings,
	}, nil
}

// templateMaterial gom chủ đề + từ vựng + ngữ pháp mới thành phần chỉ dẫn nội
// dung cho model. Đây là thứ DUY NHẤT model được tự do sáng tạo — khung bài
// đã do bản mô tả cấu trúc quyết định.
func templateMaterial(in TemplateGenerateInput) string {
	var b []string
	if t := strings.TrimSpace(in.Topic); t != "" {
		b = append(b, "Topic: "+t)
	}
	if v := strings.TrimSpace(in.Vocabulary); v != "" {
		b = append(b, "Must use these new vocabulary items naturally: "+v)
	}
	if g := strings.TrimSpace(in.Grammar); g != "" {
		b = append(b, "Must practise these grammar structures: "+g)
	}
	return strings.Join(b, "\n")
}

// ------------------------------------------------- TRẮC NGHIỆM RỜI (mcq) ---

const standaloneMCQSystem = `You are an English test item writer.
Task: write exactly %d INDEPENDENT multiple-choice items. There is no shared passage; each item is a single sentence with one gap or one question.

Rules:
- Each item: a sentence containing "_____" for the gap (or a direct question), plus 4 options.
- options: content only, no letter prefixes. Distractors must be plausible.
- correct_option: copy EXACTLY one of the 4 options.
- tested_point: name the grammar/vocabulary point in Vietnamese.
- explanation: one short sentence in Vietnamese.
- %s`

func standaloneMCQSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"items": map[string]any{
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
						"tested_point":   map[string]any{"type": "string"},
						"explanation":    map[string]any{"type": "string"},
					},
					"required": []string{"question", "options", "correct_option", "tested_point", "explanation"},
				},
			},
		},
		"required": []string{"items"},
	}
}

func genStandaloneMCQ(client ollamaChatter, model string, p ExamPart, in ExamInput, count, startNum int) (map[string]any, int, []string, error) {
	system := fmt.Sprintf(standaloneMCQSystem, count, difficultyPrompt(p, in.Difficulty))
	out, err := client.ChatStructured(model, system, strings.TrimSpace(in.Topic), standaloneMCQSchema())
	if err != nil {
		return nil, 0, nil, err
	}
	var raw struct {
		Items []struct {
			Question      string   `json:"question"`
			Options       []string `json:"options"`
			CorrectOption string   `json:"correct_option"`
			TestedPoint   string   `json:"tested_point"`
			Explanation   string   `json:"explanation"`
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
	for i, q := range raw.Items {
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
		opts, idx = shuffleOptions(opts, idx)
		items = append(items, ExamItem{
			ExamNumber:    startNum + i,
			Prompt:        strings.TrimSpace(q.Question),
			Options:       opts,
			AnswerIndex:   idx,
			CorrectOption: correct,
			TestedPoint:   strings.TrimSpace(q.TestedPoint),
			Explanation:   strings.TrimSpace(q.Explanation),
		})
	}
	end := startNum + len(items) - 1
	sec := map[string]any{
		"part_id":      p.ID,
		"part_name":    p.NameVi,
		"kind":         TplMCQ,
		"instruction":  fmt.Sprintf("Mark the letter A, B, C, or D to indicate the correct answer to each of the following questions from %d to %d.", startNum, end),
		"items":        items,
		"start_number": startNum,
		"end_number":   end,
	}
	return sec, len(items), warnings, nil
}
