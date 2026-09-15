package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

// loadOwnedProject fetches the project and enforces that the current user
// owns it (admin may access any). Writes the error response itself and
// returns nil when access is denied.
func (h *Handler) loadOwnedProject(c *gin.Context) *models.Project {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID project không hợp lệ"})
		return nil
	}
	var project models.Project
	if err := h.DB.First(&project, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy project"})
		return nil
	}
	me := auth.CurrentUser(c)
	if project.UserID != me.ID && me.Role != models.RoleAdmin {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy project"})
		return nil
	}
	return &project
}

// ListProjects returns the current user's projects, newest first.
func (h *Handler) ListProjects(c *gin.Context) {
	me := auth.CurrentUser(c)
	var projects []models.Project
	if err := h.DB.Where("user_id = ?", me.ID).Order("created_at desc").Find(&projects).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được danh sách project"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"projects": projects})
}

type createProjectRequest struct {
	Name       string `json:"name" binding:"required"`
	Subject    string `json:"subject" binding:"required"`
	GradeLevel string `json:"grade_level" binding:"required"`
}

// CreateProject creates a project after checking the subject/grade combo is
// enabled in the catalog — disabled combos are rejected at the API, not just
// greyed out in the UI.
func (h *Handler) CreateProject(c *gin.Context) {
	var req createProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cần name, subject và grade_level"})
		return
	}
	if !SubjectEnabled(req.Subject) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Môn học chưa được hỗ trợ trong bản MVP", "field": "subject"})
		return
	}
	if !GradeLevelEnabled(req.GradeLevel) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cấp học chưa được hỗ trợ trong bản MVP", "field": "grade_level"})
		return
	}

	me := auth.CurrentUser(c)
	project := models.Project{
		UserID:     me.ID,
		Name:       strings.TrimSpace(req.Name),
		Subject:    req.Subject,
		GradeLevel: req.GradeLevel,
	}
	if err := h.DB.Create(&project).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không tạo được project"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"project": project})
}

// GetProject returns one project (owner or admin).
func (h *Handler) GetProject(c *gin.Context) {
	project := h.loadOwnedProject(c)
	if project == nil {
		return
	}
	c.JSON(http.StatusOK, gin.H{"project": project})
}

// DeleteProject removes a project and its jobs/artifacts.
func (h *Handler) DeleteProject(c *gin.Context) {
	project := h.loadOwnedProject(c)
	if project == nil {
		return
	}
	h.DB.Where("project_id = ?", project.ID).Delete(&models.Artifact{})
	h.DB.Where("project_id = ?", project.ID).Delete(&models.Job{})
	if err := h.DB.Delete(project).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không xóa được project"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Đã xóa project"})
}

// ListProjectArtifacts returns the project's artifacts, newest first.
func (h *Handler) ListProjectArtifacts(c *gin.Context) {
	project := h.loadOwnedProject(c)
	if project == nil {
		return
	}
	var artifacts []models.Artifact
	if err := h.DB.Where("project_id = ?", project.ID).Order("created_at desc").Find(&artifacts).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được danh sách kết quả"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"artifacts": artifacts})
}
