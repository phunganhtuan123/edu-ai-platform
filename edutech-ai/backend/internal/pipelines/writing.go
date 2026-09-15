package pipelines

import (
	"encoding/json"
	"fmt"
	"strings"
)

// WritingInput is the job input for the writing-grading pipeline.
type WritingInput struct {
	PromptText  string `json:"prompt_text"`
	StudentText string `json:"student_text"`
	GradeLevel  string `json:"grade_level"`
}

type writingCriterion struct {
	Name      string  `json:"name"`
	Score     float64 `json:"score"`
	CommentVi string  `json:"comment_vi"`
}

type writingError struct {
	Quote         string `json:"quote"`
	Correction    string `json:"correction"`
	ExplanationVi string `json:"explanation_vi"`
}

type writingResult struct {
	OverallScore      float64            `json:"overall_score"`
	Criteria          []writingCriterion `json:"criteria"`
	Errors            []writingError     `json:"errors"`
	OverallFeedbackVi string             `json:"overall_feedback_vi"`
}

func writingSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"overall_score": map[string]any{"type": "number", "minimum": 0, "maximum": 10},
			"criteria": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"name":       map[string]any{"type": "string"},
						"score":      map[string]any{"type": "number", "minimum": 0, "maximum": 10},
						"comment_vi": map[string]any{"type": "string"},
					},
					"required": []string{"name", "score", "comment_vi"},
				},
			},
			"errors": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"quote":          map[string]any{"type": "string"},
						"correction":     map[string]any{"type": "string"},
						"explanation_vi": map[string]any{"type": "string"},
					},
					"required": []string{"quote", "correction", "explanation_vi"},
				},
			},
			"overall_feedback_vi": map[string]any{"type": "string"},
		},
		"required": []string{"overall_score", "criteria", "errors", "overall_feedback_vi"},
	}
}

// writingSystemPrompt: rubric-based grading, Vietnamese feedback
// (spec module 3). %s = grade level name.
const writingSystemPrompt = `Bạn là giáo viên tiếng Anh giàu kinh nghiệm, chấm bài viết tiếng Anh cho học sinh cấp %s tại Việt Nam.
Nhiệm vụ: chấm bài viết của học sinh theo rubric 4 tiêu chí, thang điểm 0-10 (cho từng tiêu chí và điểm tổng):
1. "Task response" — mức độ đáp ứng yêu cầu đề bài.
2. "Vocabulary" — vốn từ vựng, dùng từ chính xác và đa dạng.
3. "Grammar" — ngữ pháp, cấu trúc câu.
4. "Coherence" — tính mạch lạc, liên kết ý.

Quy tắc bắt buộc:
- criteria: đúng 4 tiêu chí trên, mỗi tiêu chí có score (0-10) và comment_vi (nhận xét ngắn gọn bằng tiếng Việt).
- overall_score: điểm tổng 0-10, nhất quán với điểm các tiêu chí.
- errors: liệt kê các lỗi cụ thể trong bài. quote: chép NGUYÊN VĂN đoạn có lỗi từ bài viết của học sinh (không tự sửa chính tả khi trích). correction: cách viết đúng. explanation_vi: giải thích lỗi bằng tiếng Việt, dễ hiểu.
- overall_feedback_vi: nhận xét tổng thể bằng tiếng Việt, có tính động viên, chỉ rõ điểm mạnh và điều cần cải thiện.
- Chấm nghiêm túc, phù hợp trình độ học sinh cấp %s; không bịa lỗi không có trong bài.`

const writingUserPrompt = `Đề bài (writing prompt):
"""
%s
"""

Bài viết của học sinh:
"""
%s
"""

Hãy chấm bài viết trên theo rubric.`

func runWriting(client ollamaChatter, model string, input json.RawMessage) (*Result, error) {
	var in WritingInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input writing không hợp lệ: %w", err)
	}
	if strings.TrimSpace(in.StudentText) == "" {
		return nil, fmt.Errorf("bài viết của học sinh rỗng")
	}

	level := gradeLevelName(in.GradeLevel)
	system := fmt.Sprintf(writingSystemPrompt, level, level)
	user := fmt.Sprintf(writingUserPrompt, strings.TrimSpace(in.PromptText), strings.TrimSpace(in.StudentText))

	content, err := client.ChatStructured(model, system, user, writingSchema())
	if err != nil {
		return nil, err
	}

	var res writingResult
	if err := json.Unmarshal([]byte(content), &res); err != nil {
		return nil, fmt.Errorf("model trả JSON không đúng cấu trúc: %w", err)
	}

	warnings := validateWriting(&res, in.StudentText)

	c, err := toContent(map[string]any{
		"overall_score":       res.OverallScore,
		"criteria":            res.Criteria,
		"errors":              res.Errors,
		"overall_feedback_vi": res.OverallFeedbackVi,
		"grade_level":         in.GradeLevel,
		"prompt_text":         in.PromptText,
		"student_text":        in.StudentText,
	})
	if err != nil {
		return nil, err
	}
	return &Result{
		Title:    fmt.Sprintf("Chấm bài viết — %.1f/10", res.OverallScore),
		Content:  c,
		Warnings: warnings,
	}, nil
}

// validateWriting checks by code what should not be trusted to the model:
// scores in [0,10] (clamped, with a warning) and every quoted error actually
// present in the student's text (warning if not — teacher must review).
func validateWriting(res *writingResult, studentText string) []string {
	var warnings []string
	clamp := func(v float64) float64 {
		if v < 0 {
			return 0
		}
		if v > 10 {
			return 10
		}
		return v
	}
	if res.OverallScore < 0 || res.OverallScore > 10 {
		warnings = append(warnings, fmt.Sprintf("Điểm tổng %.1f ngoài thang 0-10 — đã đưa về thang", res.OverallScore))
		res.OverallScore = clamp(res.OverallScore)
	}
	for i := range res.Criteria {
		cr := &res.Criteria[i]
		if cr.Score < 0 || cr.Score > 10 {
			warnings = append(warnings, fmt.Sprintf("Tiêu chí %q: điểm %.1f ngoài thang 0-10 — đã đưa về thang", cr.Name, cr.Score))
			cr.Score = clamp(cr.Score)
		}
	}
	lcText := strings.ToLower(studentText)
	for i, e := range res.Errors {
		q := strings.TrimSpace(e.Quote)
		if q == "" || !strings.Contains(lcText, strings.ToLower(q)) {
			warnings = append(warnings, fmt.Sprintf("Lỗi %d: trích dẫn %q không tìm thấy trong bài viết — cần người duyệt", i+1, e.Quote))
		}
	}
	return warnings
}
