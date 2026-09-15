package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

type registerRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Name     string `json:"name" binding:"required"`
}

// Register creates a teacher account in 'pending' state; an admin must
// approve it before login works.
func (h *Handler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Dữ liệu không hợp lệ: cần email, mật khẩu (≥8 ký tự) và họ tên"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	var existing models.User
	if err := h.DB.Where("email = ?", email).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email đã được đăng ký"})
		return
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi hệ thống"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Lỗi hệ thống"})
		return
	}
	user := models.User{
		Email:        email,
		PasswordHash: hash,
		Name:         strings.TrimSpace(req.Name),
		Role:         models.RoleTeacher,
		Status:       models.StatusPending,
	}
	if err := h.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không tạo được tài khoản"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"user":    user,
		"message": "Đăng ký thành công. Tài khoản đang chờ admin duyệt.",
	})
}

type loginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// Login returns a JWT only for active users. Pending accounts get 403 with
// code "pending", disabled accounts 403 with code "disabled".
func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cần email và mật khẩu"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	var user models.User
	if err := h.DB.Where("email = ?", email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email hoặc mật khẩu không đúng"})
		return
	}
	if !auth.CheckPassword(user.PasswordHash, req.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email hoặc mật khẩu không đúng"})
		return
	}
	switch user.Status {
	case models.StatusPending:
		c.JSON(http.StatusForbidden, gin.H{"error": "Tài khoản đang chờ admin duyệt", "code": "pending"})
		return
	case models.StatusDisabled:
		c.JSON(http.StatusForbidden, gin.H{"error": "Tài khoản đã bị khóa", "code": "disabled"})
		return
	case models.StatusActive:
		// ok
	default:
		c.JSON(http.StatusForbidden, gin.H{"error": "Tài khoản không hoạt động", "code": user.Status})
		return
	}

	token, err := auth.GenerateToken(h.Cfg.JWTSecret, user.ID, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không tạo được token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

// Me returns the authenticated user.
func (h *Handler) Me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"user": auth.CurrentUser(c)})
}
