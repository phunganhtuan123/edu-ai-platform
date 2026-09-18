package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

type adminUserRow struct {
	models.User
	JobsThisMonth     int64 `json:"jobs_this_month"`
	PromptTokens      int64 `json:"prompt_tokens"`
	CompletionTokens  int64 `json:"completion_tokens"`
	TotalTokens       int64 `json:"total_tokens"`
	UsageRecordedJobs int64 `json:"usage_recorded_jobs"`
}

type userUsageAggregate struct {
	UserID            uint
	PromptTokens      int64
	CompletionTokens  int64
	TotalTokens       int64
	UsageRecordedJobs int64
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
	userIDs := make([]uint, 0, len(users))
	for _, user := range users {
		userIDs = append(userIDs, user.ID)
	}
	usageByUser := make(map[uint]userUsageAggregate, len(users))
	if len(userIDs) > 0 {
		var aggregates []userUsageAggregate
		if err := h.DB.Model(&models.Job{}).
			Select(`user_id,
				COALESCE(SUM(CASE WHEN usage_recorded THEN prompt_tokens ELSE 0 END), 0) AS prompt_tokens,
				COALESCE(SUM(CASE WHEN usage_recorded THEN completion_tokens ELSE 0 END), 0) AS completion_tokens,
				COALESCE(SUM(CASE WHEN usage_recorded THEN total_tokens ELSE 0 END), 0) AS total_tokens,
				COALESCE(SUM(CASE WHEN usage_recorded THEN 1 ELSE 0 END), 0) AS usage_recorded_jobs`).
			Where("user_id IN ?", userIDs).
			Group("user_id").
			Scan(&aggregates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được thống kê sử dụng AI"})
			return
		}
		for _, aggregate := range aggregates {
			usageByUser[aggregate.UserID] = aggregate
		}
	}

	now := time.Now()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	rows := make([]adminUserRow, 0, len(users))
	for _, u := range users {
		var count int64
		h.DB.Model(&models.Job{}).Where("user_id = ? AND created_at >= ?", u.ID, monthStart).Count(&count)
		usage := usageByUser[u.ID]
		rows = append(rows, adminUserRow{
			User:              u,
			JobsThisMonth:     count,
			PromptTokens:      usage.PromptTokens,
			CompletionTokens:  usage.CompletionTokens,
			TotalTokens:       usage.TotalTokens,
			UsageRecordedJobs: usage.UsageRecordedJobs,
		})
	}
	c.JSON(http.StatusOK, gin.H{"users": rows})
}

type adminUsageRow struct {
	ID               uint      `json:"id"`
	UserID           uint      `json:"user_id"`
	UserName         string    `json:"user_name"`
	UserEmail        string    `json:"user_email"`
	ProjectID        uint      `json:"project_id"`
	Type             string    `json:"type"`
	Status           string    `json:"status"`
	Model            string    `json:"model"`
	PromptTokens     int64     `json:"prompt_tokens"`
	CompletionTokens int64     `json:"completion_tokens"`
	TotalTokens      int64     `json:"total_tokens"`
	UsageRecorded    bool      `json:"usage_recorded"`
	CreatedAt        time.Time `json:"created_at"`
}

type adminUsageSummary struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
	JobCount         int64 `json:"job_count"`
	RecordedJobCount int64 `json:"recorded_job_count"`
}

func parsePositiveQuery(c *gin.Context, key string, defaultValue int) (int, bool) {
	raw := c.Query(key)
	if raw == "" {
		return defaultValue, true
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": key + " phải là số nguyên dương"})
		return 0, false
	}
	return value, true
}

func (h *Handler) adminUsageQuery(userID *uint) *gorm.DB {
	q := h.DB.Table("jobs AS jobs").Joins("JOIN users ON users.id = jobs.user_id")
	if userID != nil {
		q = q.Where("jobs.user_id = ?", *userID)
	}
	return q
}

// AdminUsage returns paginated AI job history and totals over the complete
// filtered result. Jobs predating usage measurement remain explicitly marked
// usage_recorded=false and contribute no invented token counts.
func (h *Handler) AdminUsage(c *gin.Context) {
	page, ok := parsePositiveQuery(c, "page", 1)
	if !ok {
		return
	}
	if page > 1_000_000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "page quá lớn"})
		return
	}
	pageSize, ok := parsePositiveQuery(c, "page_size", 20)
	if !ok {
		return
	}
	if pageSize > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "page_size tối đa 100"})
		return
	}

	var userID *uint
	if raw := c.Query("user_id"); raw != "" {
		parsed, err := strconv.ParseUint(raw, 10, 64)
		if err != nil || parsed == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user_id phải là ID hợp lệ"})
			return
		}
		value := uint(parsed)
		userID = &value
	}

	var total int64
	if err := h.adminUsageQuery(userID).Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được lịch sử sử dụng AI"})
		return
	}

	var summary adminUsageSummary
	if err := h.adminUsageQuery(userID).
		Select(`
			COALESCE(SUM(CASE WHEN jobs.usage_recorded THEN jobs.prompt_tokens ELSE 0 END), 0) AS prompt_tokens,
			COALESCE(SUM(CASE WHEN jobs.usage_recorded THEN jobs.completion_tokens ELSE 0 END), 0) AS completion_tokens,
			COALESCE(SUM(CASE WHEN jobs.usage_recorded THEN jobs.total_tokens ELSE 0 END), 0) AS total_tokens,
			COUNT(*) AS job_count,
			COALESCE(SUM(CASE WHEN jobs.usage_recorded THEN 1 ELSE 0 END), 0) AS recorded_job_count`).
		Scan(&summary).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được thống kê sử dụng AI"})
		return
	}

	var items []adminUsageRow
	if err := h.adminUsageQuery(userID).
		Select(`jobs.id, jobs.user_id, users.name AS user_name, users.email AS user_email,
			jobs.project_id, jobs.type, jobs.status, jobs.model, jobs.prompt_tokens,
			jobs.completion_tokens, jobs.total_tokens, jobs.usage_recorded, jobs.created_at`).
		Order("jobs.created_at DESC, jobs.id DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Scan(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không đọc được lịch sử sử dụng AI"})
		return
	}

	if items == nil {
		items = []adminUsageRow{}
	}
	c.JSON(http.StatusOK, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
		"summary":   summary,
	})
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
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var projectIDs []uint
		if err := tx.Model(&models.Project{}).Where("user_id = ?", user.ID).Pluck("id", &projectIDs).Error; err != nil {
			return err
		}
		if len(projectIDs) > 0 {
			artifactIDs, err := lockArtifactIDsForDelete(tx, "project_id IN ?", projectIDs)
			if err != nil {
				return err
			}
			if len(artifactIDs) > 0 {
				if err := tx.Where("artifact_id IN ?", artifactIDs).Delete(&models.MindmapAttachment{}).Error; err != nil {
					return err
				}
			}
			if err := tx.Where("project_id IN ?", projectIDs).Delete(&models.Artifact{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&models.Job{}).Error; err != nil {
			return err
		}
		if err := tx.Where("user_id = ?", user.ID).Delete(&models.Project{}).Error; err != nil {
			return err
		}
		return tx.Delete(&user).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không xóa được người dùng"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Đã xóa người dùng"})
}
