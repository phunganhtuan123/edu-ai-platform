package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

var validJobTypes = map[string]bool{
	models.JobTypeQuiz:             true,
	models.JobTypeExam:             true,
	models.JobTypeWriting:          true,
	models.JobTypeActivity:         true,
	models.JobTypeLessonPlan:       true,
	models.JobTypeTemplateAnalyze:  true,
	models.JobTypeTemplateGenerate: true,
	models.JobTypeMindmap:          true,
}

type createJobRequest struct {
	Type  string          `json:"type" binding:"required"`
	Model string          `json:"model"`
	Input json.RawMessage `json:"input" binding:"required"`
}

const maxCreateJobBodyBytes = 256 << 10

// CreateJob handles POST /api/projects/:id/jobs: verifies project ownership,
// persists the job as 'queued' and hands it to the worker pool.
func (h *Handler) CreateJob(c *gin.Context) {
	project := h.loadOwnedProject(c)
	if project == nil {
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxCreateJobBodyBytes)
	var req createJobRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cần type và input"})
		return
	}
	if !validJobTypes[req.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type không hợp lệ"})
		return
	}
	if !JobTypeAllowedForProject(req.Type, project) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Loại nội dung này không hỗ trợ cấp học/môn học của project"})
		return
	}
	if msg := h.checkSourceLength(req.Type, req.Input); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = h.Cfg.DefaultModel
	}
	preparedInput, err := prepareJobInput(req.Type, req.Input, project)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	me := auth.CurrentUser(c)
	job := models.Job{
		UserID:    me.ID,
		ProjectID: project.ID,
		Type:      req.Type,
		Status:    models.JobQueued,
		Model:     model,
		Input:     []byte(preparedInput),
	}
	if err := h.DB.Create(&job).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không tạo được job"})
		return
	}
	h.Worker.Enqueue(job.ID)
	c.JSON(http.StatusCreated, gin.H{"job": job})
}

// JobTypeAllowedForProject prevents enabling the broader lesson-plan catalog
// from exposing the existing English-only modules to unrelated projects.
func JobTypeAllowedForProject(jobType string, project *models.Project) bool {
	if project == nil || !SubjectGradeCompatible(project.Subject, project.GradeLevel) {
		return false
	}
	switch jobType {
	case models.JobTypeLessonPlan:
		return SubjectEnabled(project.Subject) && GradeLevelEnabled(project.GradeLevel)
	case models.JobTypeMindmap:
		return project.Subject == SubjectMamNon && project.GradeLevel == GradeMamNon
	default:
		return project.Subject == "english" && (project.GradeLevel == "thcs" || project.GradeLevel == "thpt")
	}
}

// prepareJobInput injects trusted project context into lesson-plan jobs. Any
// client-supplied grade_level/subject values are overwritten.
func prepareJobInput(jobType string, input json.RawMessage, project *models.Project) (json.RawMessage, error) {
	if jobType != models.JobTypeLessonPlan {
		return input, nil
	}
	if project == nil {
		return nil, fmt.Errorf("không tìm thấy project cho giáo án")
	}
	var values map[string]any
	if err := json.Unmarshal(input, &values); err != nil {
		return nil, fmt.Errorf("input giáo án không hợp lệ")
	}
	if values == nil {
		return nil, fmt.Errorf("input giáo án phải là object")
	}
	var lesson struct {
		Topic           string `json:"topic"`
		AgeGroup        string `json:"age_group"`
		ClassName       string `json:"class_name"`
		DurationMinutes *int   `json:"duration_minutes"`
		Objectives      string `json:"objectives"`
		Materials       string `json:"materials"`
		Notes           string `json:"notes"`
	}
	if err := json.Unmarshal(input, &lesson); err != nil {
		return nil, fmt.Errorf("input giáo án không đúng kiểu dữ liệu")
	}
	lesson.Topic = strings.TrimSpace(lesson.Topic)
	lesson.AgeGroup = strings.TrimSpace(lesson.AgeGroup)
	lesson.ClassName = strings.TrimSpace(lesson.ClassName)
	lesson.Objectives = strings.TrimSpace(lesson.Objectives)
	lesson.Materials = strings.TrimSpace(lesson.Materials)
	lesson.Notes = strings.TrimSpace(lesson.Notes)
	if length := utf8.RuneCountInString(lesson.Topic); length < 1 || length > 200 {
		return nil, fmt.Errorf("topic phải có từ 1 đến 200 ký tự")
	}
	if lesson.DurationMinutes != nil && (*lesson.DurationMinutes < 5 || *lesson.DurationMinutes > 180) {
		return nil, fmt.Errorf("duration_minutes phải từ 5 đến 180")
	}
	if utf8.RuneCountInString(lesson.Objectives) > 1500 {
		return nil, fmt.Errorf("objectives tối đa 1500 ký tự")
	}
	if utf8.RuneCountInString(lesson.Materials) > 1500 {
		return nil, fmt.Errorf("materials tối đa 1500 ký tự")
	}
	if utf8.RuneCountInString(lesson.Notes) > 1000 {
		return nil, fmt.Errorf("notes tối đa 1000 ký tự")
	}
	if err := validateLessonClassAndAge(project.GradeLevel, lesson.ClassName, lesson.AgeGroup); err != nil {
		return nil, err
	}
	values["topic"] = lesson.Topic
	values["age_group"] = lesson.AgeGroup
	values["class_name"] = lesson.ClassName
	values["objectives"] = lesson.Objectives
	values["materials"] = lesson.Materials
	values["notes"] = lesson.Notes
	values["grade_level"] = project.GradeLevel
	values["subject"] = project.Subject
	prepared, err := json.Marshal(values)
	if err != nil {
		return nil, fmt.Errorf("không chuẩn bị được input giáo án")
	}
	return prepared, nil
}

func validateLessonClassAndAge(grade, className, ageGroup string) error {
	validAgeGroups := map[string]bool{"nha_tre": true, "mg_be": true, "mg_nho": true, "mg_lon": true}
	if grade == GradeMamNon {
		if ageGroup != "" && !validAgeGroups[ageGroup] {
			return fmt.Errorf("age_group không hợp lệ cho mầm non")
		}
		if className != "" {
			return fmt.Errorf("class_name không dùng cho cấp mầm non")
		}
		return nil
	}
	if ageGroup != "" {
		return fmt.Errorf("age_group chỉ dùng cho cấp mầm non")
	}
	if className == "" {
		return nil
	}
	normalized := strings.ToLower(strings.ReplaceAll(className, "ớ", "o"))
	fields := strings.Fields(normalized)
	if len(fields) != 2 || fields[0] != "lop" {
		return fmt.Errorf("class_name phải có dạng Lớp N")
	}
	classNumber, err := strconv.Atoi(fields[1])
	if err != nil {
		return fmt.Errorf("class_name phải có dạng Lớp N")
	}
	minClass, maxClass := 0, 0
	switch grade {
	case "tieuhoc":
		minClass, maxClass = 1, 5
	case "thcs":
		minClass, maxClass = 6, 9
	case "thpt":
		minClass, maxClass = 10, 12
	}
	if classNumber < minClass || classNumber > maxClass {
		return fmt.Errorf("class_name không thuộc cấp học của project")
	}
	return nil
}

// GetJob handles GET /api/jobs/:id: returns the job (owner or admin only)
// with its artifact when done — the frontend polls this every 2s.
func (h *Handler) GetJob(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID job không hợp lệ"})
		return
	}
	var job models.Job
	if err := h.DB.First(&job, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy job"})
		return
	}
	me := auth.CurrentUser(c)
	if job.UserID != me.ID && me.Role != models.RoleAdmin {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy job"})
		return
	}

	resp := gin.H{"job": job}
	if job.Status == models.JobDone {
		var artifact models.Artifact
		if err := h.DB.Where("job_id = ?", job.ID).First(&artifact).Error; err == nil {
			resp["artifact"] = artifact
		}
	}
	c.JSON(http.StatusOK, resp)
}

// checkSourceLength áp giới hạn ký tự ngữ liệu (spec mục 2c): 50–20.000 mặc
// định, chỉnh qua MIN_SOURCE_CHARS / MAX_SOURCE_CHARS. Frontend cũng chặn,
// nhưng backend không tin frontend.
//
// Đếm bằng utf8.RuneCountInString chứ không phải len(): văn bản tiếng Việt
// nhiều ký tự nhiều byte, dùng len() sẽ chặn oan.
func (h *Handler) checkSourceLength(jobType string, input json.RawMessage) string {
	var in struct {
		Text       string `json:"text"`
		SourceText string `json:"source_text"`
		SampleText string `json:"sample_text"`
	}
	if err := json.Unmarshal(input, &in); err != nil {
		return ""
	}
	text := strings.TrimSpace(in.Text)
	if text == "" {
		text = strings.TrimSpace(in.SourceText)
	}
	if text == "" {
		text = strings.TrimSpace(in.SampleText)
	}
	// Module 2 cho phép không có văn bản nguồn (chỉ đưa chủ đề).
	if text == "" {
		if jobType == models.JobTypeQuiz {
			return "Cần dán văn bản nguồn"
		}
		if jobType == models.JobTypeTemplateAnalyze {
			return "Cần dán bài tập mẫu"
		}
		return ""
	}
	n := utf8.RuneCountInString(text)
	if n < h.Cfg.MinSourceChars {
		return fmt.Sprintf("Văn bản quá ngắn: %d ký tự, tối thiểu %d", n, h.Cfg.MinSourceChars)
	}
	if n > h.Cfg.MaxSourceChars {
		return fmt.Sprintf("Văn bản quá dài: %d ký tự, tối đa %d — vui lòng cắt bớt", n, h.Cfg.MaxSourceChars)
	}
	return ""
}
