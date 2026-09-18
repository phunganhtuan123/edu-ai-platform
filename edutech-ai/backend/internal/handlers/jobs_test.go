package handlers

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

func TestPrepareJobInputOverridesLessonPlanProjectContext(t *testing.T) {
	project := &models.Project{GradeLevel: "tieuhoc", Subject: "math"}
	input := json.RawMessage(`{"topic":"Phân số","grade_level":"thpt","subject":"english"}`)

	prepared, err := prepareJobInput(models.JobTypeLessonPlan, input, project)
	if err != nil {
		t.Fatalf("prepareJobInput lỗi: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal(prepared, &got); err != nil {
		t.Fatalf("input sau chuẩn bị không phải JSON: %v", err)
	}
	if got["grade_level"] != "tieuhoc" || got["subject"] != "math" {
		t.Fatalf("client đã ghi đè ngữ cảnh project: %#v", got)
	}
}

func TestPrepareJobInputValidatesLessonPlanBeforeEnqueue(t *testing.T) {
	tests := []struct {
		name    string
		project *models.Project
		input   string
	}{
		{"topic rỗng", &models.Project{GradeLevel: "thcs", Subject: "math"}, `{"topic":" "}`},
		{"thời lượng quá ngắn", &models.Project{GradeLevel: "thcs", Subject: "math"}, `{"topic":"Đại số","duration_minutes":4}`},
		{"nhóm tuổi sai", &models.Project{GradeLevel: GradeMamNon, Subject: SubjectMamNon}, `{"topic":"Gia đình","age_group":"lop_1"}`},
		{"lớp sai cấp", &models.Project{GradeLevel: "tieuhoc", Subject: "math"}, `{"topic":"Phân số","class_name":"Lớp 8"}`},
		{"mục tiêu quá dài", &models.Project{GradeLevel: "thpt", Subject: "literature"}, `{"topic":"Thơ","objectives":"` + strings.Repeat("a", 1501) + `"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := prepareJobInput(models.JobTypeLessonPlan, json.RawMessage(tt.input), tt.project); err == nil {
				t.Fatalf("input không hợp lệ phải bị từ chối: %s", tt.input)
			}
		})
	}
}

func TestJobTypeAllowedForProjectDoesNotOpenEnglishModules(t *testing.T) {
	tests := []struct {
		name    string
		jobType string
		grade   string
		subject string
		want    bool
	}{
		{"lesson plan tiểu học toán", models.JobTypeLessonPlan, "tieuhoc", "math", true},
		{"lesson plan mầm non", models.JobTypeLessonPlan, GradeMamNon, SubjectMamNon, true},
		{"quiz không mở cho toán", models.JobTypeQuiz, "tieuhoc", "math", false},
		{"quiz không mở cho tiếng Anh tiểu học", models.JobTypeQuiz, "tieuhoc", "english", false},
		{"quiz tiếng Anh THCS giữ nguyên", models.JobTypeQuiz, "thcs", "english", true},
		{"mindmap chỉ mầm non", models.JobTypeMindmap, "thcs", "english", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			project := &models.Project{GradeLevel: tt.grade, Subject: tt.subject}
			if got := JobTypeAllowedForProject(tt.jobType, project); got != tt.want {
				t.Fatalf("JobTypeAllowedForProject() = %v, cần %v", got, tt.want)
			}
		})
	}
}
