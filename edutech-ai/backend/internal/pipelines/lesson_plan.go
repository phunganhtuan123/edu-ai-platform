package pipelines

import (
	"encoding/json"
	"fmt"
	"strings"
)

// LessonPlanInput is persisted with GradeLevel and Subject injected by the
// backend from the owning project. Values supplied by API clients are ignored.
type LessonPlanInput struct {
	Topic           string `json:"topic"`
	AgeGroup        string `json:"age_group,omitempty"`
	ClassName       string `json:"class_name,omitempty"`
	DurationMinutes int    `json:"duration_minutes,omitempty"`
	Objectives      string `json:"objectives,omitempty"`
	Materials       string `json:"materials,omitempty"`
	Notes           string `json:"notes,omitempty"`
	GradeLevel      string `json:"grade_level"`
	Subject         string `json:"subject"`
}

type LessonPlanActivity struct {
	Title           string `json:"title"`
	DurationMinutes int    `json:"duration_minutes"`
	TeacherActions  string `json:"teacher_actions"`
	StudentActions  string `json:"student_actions"`
	Resources       string `json:"resources"`
}

type lessonPlanModelOutput struct {
	Title           string               `json:"title"`
	Objectives      []string             `json:"objectives"`
	Materials       []string             `json:"materials"`
	Activities      []LessonPlanActivity `json:"activities"`
	Assessment      []string             `json:"assessment"`
	Differentiation []string             `json:"differentiation"`
}

type lessonPlanContent struct {
	Title           string               `json:"title"`
	Topic           string               `json:"topic"`
	GradeLevel      string               `json:"grade_level"`
	Subject         string               `json:"subject"`
	ClassName       string               `json:"class_name"`
	AgeGroup        string               `json:"age_group"`
	DurationMinutes int                  `json:"duration_minutes"`
	Objectives      []string             `json:"objectives"`
	Materials       []string             `json:"materials"`
	Activities      []LessonPlanActivity `json:"activities"`
	Assessment      []string             `json:"assessment"`
	Differentiation []string             `json:"differentiation"`
	Warnings        []string             `json:"warnings"`
}

func lessonPlanSchema() map[string]any {
	stringArray := func() map[string]any {
		return map[string]any{"type": "array", "items": map[string]any{"type": "string"}}
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"title":      map[string]any{"type": "string"},
			"objectives": stringArray(),
			"materials":  stringArray(),
			"activities": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"title":            map[string]any{"type": "string"},
						"duration_minutes": map[string]any{"type": "integer", "minimum": 1},
						"teacher_actions":  map[string]any{"type": "string"},
						"student_actions":  map[string]any{"type": "string"},
						"resources":        map[string]any{"type": "string"},
					},
					"required": []string{"title", "duration_minutes", "teacher_actions", "student_actions", "resources"},
				},
				"minItems": 1,
			},
			"assessment":      stringArray(),
			"differentiation": stringArray(),
		},
		"required": []string{"title", "objectives", "materials", "activities", "assessment", "differentiation"},
	}
}

const lessonPlanSystemPrompt = `Bạn là chuyên gia thiết kế giáo án điện tử cho giáo viên Việt Nam.
Hãy soạn một giáo án cấp %s, môn/lĩnh vực %s bằng tiếng Việt.
Giáo án phải có mục tiêu quan sát được, hoạt động theo trình tự rõ ràng, đánh giá phù hợp và phương án phân hóa.
Tổng duration_minutes của các hoạt động nên bằng thời lượng tiết học. Không đưa grade_level hoặc subject vào JSON vì hệ thống tự lấy từ project.`

var preschoolAgeNames = map[string]string{
	"nha_tre": "Nhà trẻ 24–36 tháng",
	"mg_be":   "Mẫu giáo bé 3–4 tuổi",
	"mg_nho":  "Mẫu giáo nhỡ 4–5 tuổi",
	"mg_lon":  "Mẫu giáo lớn 5–6 tuổi",
}

func subjectName(key string) string {
	switch key {
	case "english":
		return "Tiếng Anh"
	case "math":
		return "Toán"
	case "science":
		return "Khoa học tự nhiên"
	case "literature":
		return "Ngữ văn"
	case "mamnon_chung":
		return "Giáo dục mầm non"
	default:
		return key
	}
}

func defaultLessonDuration(grade string) int {
	if grade == "mamnon" {
		return 30
	}
	return 45
}

func runLessonPlan(client ollamaChatter, model string, input json.RawMessage) (*Result, error) {
	var in LessonPlanInput
	if err := json.Unmarshal(input, &in); err != nil {
		return nil, fmt.Errorf("input giáo án không hợp lệ: %w", err)
	}
	in.Topic = strings.TrimSpace(in.Topic)
	in.GradeLevel = strings.TrimSpace(in.GradeLevel)
	in.Subject = strings.TrimSpace(in.Subject)
	if in.Topic == "" {
		return nil, fmt.Errorf("cần chủ đề giáo án (topic)")
	}
	if in.GradeLevel == "" || in.Subject == "" {
		return nil, fmt.Errorf("thiếu cấp học hoặc môn học từ project")
	}
	if in.DurationMinutes <= 0 {
		in.DurationMinutes = defaultLessonDuration(in.GradeLevel)
	}

	request, err := json.Marshal(map[string]any{
		"topic":            in.Topic,
		"age_group":        strings.TrimSpace(in.AgeGroup),
		"class_name":       strings.TrimSpace(in.ClassName),
		"duration_minutes": in.DurationMinutes,
		"objectives":       strings.TrimSpace(in.Objectives),
		"materials":        strings.TrimSpace(in.Materials),
		"notes":            strings.TrimSpace(in.Notes),
	})
	if err != nil {
		return nil, err
	}
	system := fmt.Sprintf(lessonPlanSystemPrompt, gradeLevelName(in.GradeLevel), subjectName(in.Subject))
	if in.GradeLevel == "mamnon" {
		ageName := preschoolAgeNames[strings.TrimSpace(in.AgeGroup)]
		if ageName == "" {
			ageName = "Mầm non (chưa chọn nhóm tuổi cụ thể)"
		}
		system += fmt.Sprintf("\nNhóm tuổi: %s. Ưu tiên hoạt động chơi và trải nghiệm, bảo đảm an toàn, phù hợp vận động; không yêu cầu trẻ đọc hoặc viết, đặc biệt với nhà trẻ.", ageName)
	}
	raw, err := client.ChatStructured(model, system, "Yêu cầu giáo án:\n"+string(request), lessonPlanSchema())
	if err != nil {
		return nil, err
	}

	var generated lessonPlanModelOutput
	if err := json.Unmarshal([]byte(raw), &generated); err != nil {
		return nil, fmt.Errorf("model trả JSON giáo án không đúng cấu trúc: %w", err)
	}
	if len(generated.Activities) == 0 {
		return nil, fmt.Errorf("model không sinh hoạt động nào cho giáo án")
	}
	if strings.TrimSpace(generated.Title) == "" {
		generated.Title = "Giáo án: " + in.Topic
	} else {
		generated.Title = strings.TrimSpace(generated.Title)
	}
	if len(generated.Objectives) == 0 {
		generated.Objectives = splitLessonLines(in.Objectives)
	}
	if len(generated.Materials) == 0 {
		generated.Materials = splitLessonLines(in.Materials)
	}
	generated.Objectives = normalizeLessonStrings(generated.Objectives)
	generated.Materials = normalizeLessonStrings(generated.Materials)
	generated.Assessment = normalizeLessonStrings(generated.Assessment)
	generated.Differentiation = normalizeLessonStrings(generated.Differentiation)

	warnings := []string{"Giáo án do AI tạo là bản nháp; giáo viên cần duyệt và điều chỉnh trước khi sử dụng."}
	if len(generated.Objectives) == 0 {
		warnings = append(warnings, "Giáo án chưa có mục tiêu học tập cụ thể")
	}
	if len(generated.Assessment) == 0 {
		warnings = append(warnings, "Giáo án chưa có tiêu chí hoặc hoạt động đánh giá")
	}
	totalActivityMinutes := 0
	for index := range generated.Activities {
		activity := &generated.Activities[index]
		activity.Title = strings.TrimSpace(activity.Title)
		activity.TeacherActions = strings.TrimSpace(activity.TeacherActions)
		activity.StudentActions = strings.TrimSpace(activity.StudentActions)
		activity.Resources = strings.TrimSpace(activity.Resources)
		if strings.TrimSpace(activity.Title) == "" || strings.TrimSpace(activity.TeacherActions) == "" || strings.TrimSpace(activity.StudentActions) == "" {
			return nil, fmt.Errorf("hoạt động %d thiếu tiêu đề hoặc hành động của giáo viên/học sinh", index+1)
		}
		if activity.DurationMinutes <= 0 {
			return nil, fmt.Errorf("hoạt động %d có thời lượng không hợp lệ", index+1)
		}
		totalActivityMinutes += activity.DurationMinutes
	}
	if totalActivityMinutes != in.DurationMinutes {
		warnings = append(warnings, fmt.Sprintf(
			"Tổng thời lượng hoạt động (%d phút) khác thời lượng giáo án (%d phút)",
			totalActivityMinutes, in.DurationMinutes))
	}
	content, err := toContent(lessonPlanContent{
		Title:           generated.Title,
		Topic:           in.Topic,
		GradeLevel:      in.GradeLevel,
		Subject:         in.Subject,
		ClassName:       strings.TrimSpace(in.ClassName),
		AgeGroup:        strings.TrimSpace(in.AgeGroup),
		DurationMinutes: in.DurationMinutes,
		Objectives:      generated.Objectives,
		Materials:       generated.Materials,
		Activities:      generated.Activities,
		Assessment:      generated.Assessment,
		Differentiation: generated.Differentiation,
		Warnings:        []string{},
	})
	if err != nil {
		return nil, err
	}
	return &Result{Title: generated.Title, Content: content, Warnings: warnings}, nil
}

func normalizeLessonStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func splitLessonLines(value string) []string {
	lines := strings.Split(value, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			result = append(result, line)
		}
	}
	return result
}
