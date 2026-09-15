package pipelines

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"strings"
)

// QuizInput is the job input for the quiz pipeline.
type QuizInput struct {
	Text         string `json:"text"`
	NumQuestions int    `json:"num_questions"`
	GradeLevel   string `json:"grade_level"`
	Difficulty   string `json:"difficulty"` // easy | medium | hard (spec mục 2c)
}

// QuizQuestion is the normalized output shape (shared with the activity
// pipeline input): options already shuffled by code, answer_index recorded.
type QuizQuestion struct {
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	AnswerIndex int      `json:"answer_index"`
	Explanation string   `json:"explanation"`
	BloomLevel  string   `json:"bloom_level"`
}

// rawQuizQuestion matches the model's schema-enforced output.
type rawQuizQuestion struct {
	Question      string   `json:"question"`
	Options       []string `json:"options"`
	CorrectOption string   `json:"correct_option"`
	Explanation   string   `json:"explanation"`
	BloomLevel    string   `json:"bloom_level"`
}

// quizSchema is the JSON schema sent to Ollama structured output
// (port of edu-cli QUIZ_SCHEMA).
func quizSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"questions": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"question": map[string]any{"type": "string"},
						"options": map[string]any{
							"type":     "array",
							"items":    map[string]any{"type": "string"},
							"minItems": 4,
							"maxItems": 4,
						},
						"correct_option": map[string]any{"type": "string"},
						"explanation":    map[string]any{"type": "string"},
						"bloom_level": map[string]any{
							"type": "string",
							"enum": []string{"nhận biết", "thông hiểu", "vận dụng"},
						},
					},
					"required": []string{"question", "options", "correct_option", "explanation", "bloom_level"},
				},
			},
		},
		"required": []string{"questions"},
	}
}

// quizSystemPrompt is the edu-cli SYSTEM_PROMPT (main.py), %s = grade level name.
const quizSystemPrompt = `Bạn là trợ lý soạn đề cho giáo viên Việt Nam.
Nhiệm vụ: đọc văn bản được cung cấp và soạn câu hỏi trắc nghiệm 4 lựa chọn (A/B/C/D) CHỈ dựa trên nội dung văn bản đó.

Quy tắc bắt buộc:
- Viết bằng tiếng Việt chuẩn mực, phù hợp học sinh cấp %s.
- Mỗi câu đúng 4 lựa chọn; chỉ 1 đáp án đúng; các phương án nhiễu phải hợp lý, không ngớ ngẩn.
- options: chỉ ghi NỘI DUNG lựa chọn, KHÔNG thêm tiền tố "A.", "B.", "C.", "D.".
- correct_option: chép lại NGUYÊN VĂN nội dung của lựa chọn đúng (phải trùng khớp với một phần tử trong options).
- Không hỏi kiến thức ngoài văn bản.
- Phân bổ mức độ theo thang Bloom rút gọn: nhận biết / thông hiểu / vận dụng.
- explanation: giải thích ngắn gọn vì sao đáp án đúng, trích ý từ văn bản; không nhắc chữ cái A/B/C/D.\n- %s`

// quizUserPrompt is the edu-cli USER_PROMPT (main.py).
const quizUserPrompt = `Văn bản:
"""
%s
"""

Hãy soạn đúng %d câu hỏi trắc nghiệm theo quy tắc.`

func runQuiz(client ollamaChatter, model string, input json.RawMessage) (*Result, error) {
	var in QuizInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input quiz không hợp lệ: %w", err)
	}
	if strings.TrimSpace(in.Text) == "" {
		return nil, fmt.Errorf("văn bản đầu vào rỗng")
	}
	if in.NumQuestions <= 0 {
		in.NumQuestions = 5
	}
	if in.NumQuestions > 30 {
		in.NumQuestions = 30
	}

	in.Difficulty = NormalizeDifficulty(in.Difficulty)
	d := difficultyByKey(in.Difficulty)
	diffLine := fmt.Sprintf(
		"Độ khó mong muốn: %s (CEFR %s cho ngữ liệu tiếng Anh). Câu hỏi và lựa chọn giữ độ dài trung bình khoảng %d từ trở xuống.",
		d.NameVi, d.CEFR, d.maxAvgWords)
	system := fmt.Sprintf(quizSystemPrompt, gradeLevelName(in.GradeLevel), diffLine)
	user := fmt.Sprintf(quizUserPrompt, strings.TrimSpace(in.Text), in.NumQuestions)

	content, err := client.ChatStructured(model, system, user, quizSchema())
	if err != nil {
		return nil, err
	}

	var raw struct {
		Questions []rawQuizQuestion `json:"questions"`
	}
	if err := json.Unmarshal([]byte(content), &raw); err != nil {
		return nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}

	questions, warnings := normalizeQuiz(raw.Questions)
	if len(questions) == 0 {
		return nil, fmt.Errorf("model không sinh được câu hỏi nào")
	}
	if len(questions) != in.NumQuestions {
		warnings = append(warnings, fmt.Sprintf("Số câu sinh ra (%d) khác số câu yêu cầu (%d)", len(questions), in.NumQuestions))
	}

	c, err := toContent(map[string]any{
		"questions":   questions,
		"grade_level": in.GradeLevel,
	})
	if err != nil {
		return nil, err
	}
	return &Result{
		Title:    fmt.Sprintf("Trắc nghiệm %d câu (%s)", len(questions), gradeLevelName(in.GradeLevel)),
		Content:  c,
		Warnings: warnings,
	}, nil
}

// normalizeQuiz ports edu-cli normalize_and_validate: clean prefixes, derive
// answer index from content (exact then substring match), shuffle options in
// code (defeats the model's positional bias) and record the new answer_index.
func normalizeQuiz(raw []rawQuizQuestion) ([]QuizQuestion, []string) {
	var warnings []string
	questions := make([]QuizQuestion, 0, len(raw))
	for i, q := range raw {
		num := i + 1
		opts := make([]string, 0, len(q.Options))
		for _, o := range q.Options {
			opts = append(opts, cleanOption(o))
		}
		if len(opts) != 4 {
			warnings = append(warnings, fmt.Sprintf("Câu %d: không đủ 4 lựa chọn", num))
		}
		if hasDuplicateOptions(opts) {
			warnings = append(warnings, fmt.Sprintf("Câu %d: lựa chọn bị trùng nhau", num))
		}
		if strings.TrimSpace(q.Question) == "" {
			warnings = append(warnings, fmt.Sprintf("Câu %d: thiếu nội dung câu hỏi", num))
		}

		idx := matchOptionIndex(opts, cleanOption(q.CorrectOption))
		if idx < 0 {
			warnings = append(warnings, fmt.Sprintf("Câu %d: correct_option không khớp lựa chọn nào — cần người duyệt", num))
			idx = 0
		}

		// Shuffle options in code and track where the correct one lands.
		order := rand.Perm(len(opts))
		shuffled := make([]string, len(opts))
		answerIndex := 0
		for newPos, oldPos := range order {
			shuffled[newPos] = opts[oldPos]
			if oldPos == idx {
				answerIndex = newPos
			}
		}

		questions = append(questions, QuizQuestion{
			Question:    q.Question,
			Options:     shuffled,
			AnswerIndex: answerIndex,
			Explanation: q.Explanation,
			BloomLevel:  q.BloomLevel,
		})
	}
	return questions, warnings
}
