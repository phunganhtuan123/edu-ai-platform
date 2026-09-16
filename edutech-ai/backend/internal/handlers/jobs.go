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
	models.JobTypeTemplateAnalyze:  true,
	models.JobTypeTemplateGenerate: true,
	models.JobTypeMindmap:          true,
}

type createJobRequest struct {
	Type  string          `json:"type" binding:"required"`
	Model string          `json:"model"`
	Input json.RawMessage `json:"input" binding:"required"`
}

// CreateJob handles POST /api/projects/:id/jobs: verifies project ownership,
// persists the job as 'queued' and hands it to the worker pool.
func (h *Handler) CreateJob(c *gin.Context) {
	project := h.loadOwnedProject(c)
	if project == nil {
		return
	}
	var req createJobRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cần type và input"})
		return
	}
	if !validJobTypes[req.Type] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type không hợp lệ"})
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

	me := auth.CurrentUser(c)
	job := models.Job{
		UserID:    me.ID,
		ProjectID: project.ID,
		Type:      req.Type,
		Status:    models.JobQueued,
		Model:     model,
		Input:     []byte(req.Input),
	}
	if err := h.DB.Create(&job).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không tạo được job"})
		return
	}
	h.Worker.Enqueue(job.ID)
	c.JSON(http.StatusCreated, gin.H{"job": job})
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
