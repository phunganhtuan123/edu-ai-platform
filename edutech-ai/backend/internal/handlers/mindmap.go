package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
	"github.com/ai-for-edu/edutech-ai/backend/internal/pipelines"
)

type saveMindmapRequest struct {
	Root *pipelines.MindNode `json:"root" binding:"required"`
}

// SaveMindmap handles PUT /api/artifacts/:id/mindmap: lưu cây giáo viên đã sửa
// trên trình vẽ sơ đồ. Chỉ thay `root` (và `topic` theo nút gốc); các trường
// khác của content (loại sơ đồ, nhóm tuổi, cảnh báo) giữ nguyên.
func (h *Handler) SaveMindmap(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}
	me := auth.CurrentUser(c)

	var artifact models.Artifact
	if err := h.DB.First(&artifact, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy kết quả"})
		return
	}
	var project models.Project
	if err := h.DB.First(&project, artifact.ProjectID).Error; err != nil ||
		(project.UserID != me.ID && me.Role != models.RoleAdmin) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy kết quả"})
		return
	}
	if artifact.Type != models.JobTypeMindmap {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kết quả này không phải sơ đồ tư duy"})
		return
	}

	var req saveMindmapRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cần root là cây sơ đồ"})
		return
	}
	root, err := pipelines.NormalizeEditedMindTree(req.Root)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	content := map[string]any{}
	if len(artifact.Content) > 0 {
		_ = json.Unmarshal(artifact.Content, &content)
	}
	content["root"] = root
	content["topic"] = root.Text
	b, err := json.Marshal(content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không lưu được sơ đồ"})
		return
	}
	if err := h.DB.Model(&artifact).Update("content", datatypes.JSON(b)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không lưu được sơ đồ"})
		return
	}
	artifact.Content = datatypes.JSON(b)
	c.JSON(http.StatusOK, gin.H{"artifact": artifact})
}
