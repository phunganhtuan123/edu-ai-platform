package pipelines

import (
	"encoding/json"
	"strings"
	"testing"
)

type lessonPlanFake struct {
	system string
	user   string
	reply  string
}

func (f *lessonPlanFake) ChatStructured(model, system, user string, schema map[string]any) (string, error) {
	f.system = system
	f.user = user
	if f.reply != "" {
		return f.reply, nil
	}
	return `{
		"title":"Khám phá vòng đời của cây",
		"objectives":["Nêu được các giai đoạn phát triển của cây"],
		"materials":["Tranh vòng đời của cây"],
		"activities":[
			{"title":"Khởi động","duration_minutes":5,"teacher_actions":"Đặt câu hỏi gợi mở","student_actions":"Quan sát và trả lời","resources":"Tranh"},
			{"title":"Khám phá","duration_minutes":25,"teacher_actions":"Hướng dẫn quan sát","student_actions":"Thảo luận nhóm","resources":"Phiếu học tập"}
		],
		"assessment":["Quan sát phần trình bày của học sinh"],
		"differentiation":["Gợi ý bằng hình ảnh cho học sinh cần hỗ trợ"]
	}`, nil
}

func TestRunLessonPlanUsesProjectContextAndStableContract(t *testing.T) {
	fake := &lessonPlanFake{}
	input := json.RawMessage(`{
		"topic":"Vòng đời của cây",
		"class_name":"Lớp 4A",
		"duration_minutes":35,
		"objectives":"Hiểu vòng đời của cây\nTrình bày theo nhóm",
		"materials":"Hạt đậu\nTranh minh hoạ",
		"notes":"Ưu tiên hoạt động nhóm",
		"grade_level":"tieuhoc",
		"subject":"science"
	}`)

	result, err := runLessonPlan(fake, "model", input)
	if err != nil {
		t.Fatalf("runLessonPlan lỗi: %v", err)
	}

	content := result.Content
	if content["topic"] != "Vòng đời của cây" || content["grade_level"] != "tieuhoc" || content["subject"] != "science" {
		t.Fatalf("ngữ cảnh project bị sai: %#v", content)
	}
	if content["class_name"] != "Lớp 4A" || int(content["duration_minutes"].(float64)) != 35 {
		t.Fatalf("thông tin lớp/thời lượng bị sai: %#v", content)
	}
	if len(content["activities"].([]any)) != 2 || len(content["assessment"].([]any)) != 1 {
		t.Fatalf("content không đúng contract: %#v", content)
	}
	if !strings.Contains(fake.system, "tiểu học") || !strings.Contains(fake.system, "Khoa học tự nhiên") {
		t.Fatalf("prompt phải dùng cấp/môn từ project: %s", fake.system)
	}
	if !strings.Contains(fake.user, "Ưu tiên hoạt động nhóm") {
		t.Fatalf("prompt thiếu ghi chú giáo viên: %s", fake.user)
	}
	if len(result.Warnings) == 0 {
		t.Fatalf("tổng thời lượng hoạt động 30 khác 35 phải có cảnh báo")
	}
}

func TestRunLessonPlanDefaultsDurationByGradeAndRejectsMissingContext(t *testing.T) {
	result, err := runLessonPlan(&lessonPlanFake{}, "model", json.RawMessage(`{
		"topic":"Gia đình của bé",
		"age_group":"mẫu giáo 4-5 tuổi",
		"grade_level":"mamnon",
		"subject":"mamnon_chung"
	}`))
	if err != nil {
		t.Fatalf("giáo án mầm non hợp lệ bị từ chối: %v", err)
	}
	if got := int(result.Content["duration_minutes"].(float64)); got != 30 {
		t.Fatalf("thời lượng mặc định mầm non = %d, cần 30", got)
	}

	for _, input := range []string{
		`{"topic":" ","grade_level":"thcs","subject":"math"}`,
		`{"topic":"Đại số","subject":"math"}`,
		`{"topic":"Đại số","grade_level":"thcs"}`,
	} {
		if _, err := runLessonPlan(&lessonPlanFake{}, "model", json.RawMessage(input)); err == nil {
			t.Fatalf("input thiếu topic/ngữ cảnh project phải bị từ chối: %s", input)
		}
	}
}

func TestRunLessonPlanPreschoolPromptAndReviewWarnings(t *testing.T) {
	fake := &lessonPlanFake{}
	result, err := runLessonPlan(fake, "model", json.RawMessage(`{
		"topic":"Gia đình của bé",
		"age_group":"nha_tre",
		"duration_minutes":30,
		"grade_level":"mamnon",
		"subject":"mamnon_chung"
	}`))
	if err != nil {
		t.Fatalf("runLessonPlan lỗi: %v", err)
	}
	if !strings.Contains(fake.system, "24–36 tháng") || !strings.Contains(fake.system, "không yêu cầu trẻ đọc hoặc viết") {
		t.Fatalf("prompt nhà trẻ thiếu hướng dẫn độ tuổi/an toàn: %s", fake.system)
	}
	warnings := strings.Join(result.Warnings, "|")
	if !strings.Contains(warnings, "giáo viên") {
		t.Fatalf("mọi giáo án phải cảnh báo cần giáo viên duyệt: %v", result.Warnings)
	}
}

func TestRunLessonPlanRejectsInvalidGeneratedActivity(t *testing.T) {
	fake := &lessonPlanFake{reply: `{
		"title":"Sai",
		"objectives":[],
		"materials":[],
		"activities":[{"title":"","duration_minutes":-1,"teacher_actions":"","student_actions":"","resources":""}],
		"assessment":[],
		"differentiation":[]
	}`}
	_, err := runLessonPlan(fake, "model", json.RawMessage(`{
		"topic":"Đại số","grade_level":"thcs","subject":"math"
	}`))
	if err == nil {
		t.Fatalf("hoạt động thiếu nội dung/thời lượng âm phải bị từ chối")
	}
}
