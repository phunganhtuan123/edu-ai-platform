// Package pipelines implements the 4 MVP generation pipelines (quiz, exam,
// writing, activity). Each pipeline builds prompts, calls Ollama structured
// output (except activity, which is pure templating), then validates and
// normalizes the result BY CODE — never trusting the model — porting the
// proven logic of edu-cli (educli/main.py and educli/thpt.py).
package pipelines

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
	"github.com/ai-for-edu/edutech-ai/backend/internal/ollama"
)

// ollamaChatter is the part of the Ollama client the pipelines need.
type ollamaChatter interface {
	ChatStructured(model, system, user string, schema map[string]any) (string, error)
}

// Result is what a pipeline produces: the artifact payload plus code-side
// validation warnings for the teacher to review in the UI.
type Result struct {
	Title    string
	Content  map[string]any
	Warnings []string
}

// ProgressFunc là callback báo tiến độ của một job nhiều bước (module 2 sinh
// lần lượt từng phần thi). Worker dùng nó để ghi cột jobs.progress, frontend
// polling đọc ra và hiện "Đang soạn Phần 3/6" — không để thanh chạy câm khi
// model local mất vài phút mỗi phần.
type ProgressFunc func(current, total int, label string)

// Run dispatches a job to its pipeline.
func Run(client *ollama.Client, model, jobType string, input json.RawMessage, progress ProgressFunc) (*Result, error) {
	switch jobType {
	case models.JobTypeQuiz:
		return runQuiz(client, model, input)
	case models.JobTypeExam:
		return runExam(client, model, input, progress)
	case models.JobTypeWriting:
		return runWriting(client, model, input)
	case models.JobTypeActivity:
		return runActivity(input)
	case models.JobTypeTemplateAnalyze:
		return runTemplateAnalyze(client, model, input)
	case models.JobTypeTemplateGenerate:
		return runTemplateGenerate(client, model, input, progress)
	default:
		return nil, fmt.Errorf("loại job không hỗ trợ: %s", jobType)
	}
}

// gradeLevelName maps grade level keys to the human name used in prompts
// (edu-cli LEVELS map).
func gradeLevelName(key string) string {
	switch key {
	case "th", "tieuhoc":
		return "tiểu học"
	case "thcs":
		return "THCS"
	case "thpt":
		return "THPT"
	case "dh":
		return "đại học"
	case "mamnon":
		return "mầm non"
	default:
		if key == "" {
			return "THPT"
		}
		return key
	}
}

var optionPrefixRe = regexp.MustCompile(`^\s*[A-Da-d][\.\)]\s*`)

// cleanOption strips a stray "A. " / "b) " prefix the model may have added
// (port of edu-cli _clean_option).
func cleanOption(s string) string {
	return strings.TrimSpace(optionPrefixRe.ReplaceAllString(s, ""))
}

// matchOptionIndex finds which option the model's correct_option refers to:
// exact (case-insensitive) match first, then a relaxed containment match.
// Returns -1 when nothing matches (port of edu-cli's key anti-error idea:
// the model returns the correct answer as CONTENT, code derives the index).
func matchOptionIndex(options []string, correct string) int {
	lc := strings.ToLower(strings.TrimSpace(correct))
	for j, o := range options {
		if strings.ToLower(o) == lc {
			return j
		}
	}
	for j, o := range options {
		lo := strings.ToLower(o)
		if lc != "" && (strings.Contains(lo, lc) || strings.Contains(lc, lo)) {
			return j
		}
	}
	return -1
}

// hasDuplicateOptions reports whether any options coincide case-insensitively.
func hasDuplicateOptions(options []string) bool {
	seen := map[string]bool{}
	for _, o := range options {
		k := strings.ToLower(o)
		if seen[k] {
			return true
		}
		seen[k] = true
	}
	return false
}

// toContent marshals a typed value into the generic map used for JSONB
// artifact content.
func toContent(v any) (map[string]any, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return m, nil
}
