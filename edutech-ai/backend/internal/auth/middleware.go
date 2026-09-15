package auth

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

// ContextUserKey is the Gin context key under which the authenticated user is stored.
const ContextUserKey = "user"

// CurrentUser returns the authenticated user set by Middleware.
func CurrentUser(c *gin.Context) *models.User {
	v, ok := c.Get(ContextUserKey)
	if !ok {
		return nil
	}
	u, _ := v.(*models.User)
	return u
}

// Middleware validates the Bearer JWT, loads the user from the database and
// stores it in the request context. Disabled users are rejected immediately,
// so an admin disabling an account blocks it on the next request.
func Middleware(db *gorm.DB, secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Thiếu token xác thực"})
			return
		}
		claims, err := ParseToken(secret, strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token không hợp lệ hoặc đã hết hạn"})
			return
		}
		var user models.User
		if err := db.First(&user, claims.UserID).Error; err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Tài khoản không tồn tại"})
			return
		}
		if user.Status != models.StatusActive {
			code := "disabled"
			if user.Status == models.StatusPending {
				code = "pending"
			}
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Tài khoản không hoạt động", "code": code})
			return
		}
		c.Set(ContextUserKey, &user)
		c.Next()
	}
}

// AdminOnly requires the authenticated user to have the admin role.
func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		user := CurrentUser(c)
		if user == nil || user.Role != models.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Chỉ admin mới có quyền truy cập"})
			return
		}
		c.Next()
	}
}
