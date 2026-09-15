package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

type adminUserRow struct {
	models.User
	JobsThisMonth int64 `json:"jobs_this_month"`
}

// AdminListUsers lists users, optionally filtered by ?status=, with each
// user's job count for the current month (spec section 3).
func (h *Handler) AdminListUsers(c *gin.Context) {
	q := h.DB.Model(&models.User{}).Order("created_at desc")
	if status := c.Query("status"); status != "" {
		q = q.Where("status = ?", status)
	}
	var users []models.User
	if err := q.Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được danh sách người dùng"})
		return
	}

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	rows := make([]adminUserRow, 0, len(users))
	for _, u := range users {
		var count int64
		h.DB.Model(&models.Job{}).Where("user_id = ? AND created_at >= ?", u.ID, monthStart).Count(&count)
		rows = append(rows, adminUserRow{User: u, JobsThisMonth: count})
	}
	c.JSON(http.StatusOK, gin.H{"users": rows})
}

type patchUserRequest struct {
	Action string `json:"action" binding:"required"`
}

// AdminPatchUser applies approve (pending→active), disable (→disabled) or
// enable (→active). An admin cannot disable themselves.
func (h *Handler) AdminPatchUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}
	var req patchUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cần trường action (approve/disable/enable)"})
		return
	}

	var user models.User
	if err := h.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy người dùng"})
		return
	}

	me := auth.CurrentUser(c)
	var newStatus string
	switch req.Action {
	case "approve":
		if user.Status != models.StatusPending {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Chỉ duyệt được tài khoản đang chờ (pending)"})
			return
		}
		newStatus = models.StatusActive
	case "disable":
		if user.ID == me.ID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Admin không thể tự khóa chính mình"})
			return
		}
		newStatus = models.StatusDisabled
	case "enable":
		newStatus = models.StatusActive
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "action phải là approve, disable hoặc enable"})
		return
	}

	if err := h.DB.Model(&user).Update("status", newStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không cập nhật được trạng thái"})
		return
	}
	user.Status = newStatus
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// AdminDeleteUser permanently deletes a user and their data. An admin cannot
// delete themselves.
func (h *Handler) AdminDeleteUser(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}
	me := auth.CurrentUser(c)
	if uint(id) == me.ID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Admin không thể tự xóa chính mình"})
		return
	}
	var user models.User
	if err := h.DB.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy người dùng"})
		return
	}

	// Cascade-delete the user's data (MVP: explicit deletes, no FK cascade).
	var projectIDs []uint
	h.DB.Model(&models.Project{}).Where("user_id = ?", user.ID).Pluck("id", &projectIDs)
	if len(projectIDs) > 0 {
		h.DB.Where("project_id IN ?", projectIDs).Delete(&models.Artifact{})
	}
	h.DB.Where("user_id = ?", user.ID).Delete(&models.Job{})
	h.DB.Where("user_id = ?", user.ID).Delete(&models.Project{})
	if err := h.DB.Delete(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không xóa được người dùng"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Đã xóa người dùng"})
}
