package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/google"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

// Nối tài khoản Google của từng giáo viên (spec mục 2b).
//
// Google là TÍNH NĂNG TUỲ CHỌN: chưa cấu hình GOOGLE_* hoặc giáo viên chưa nối
// thì mọi module khác vẫn chạy bình thường, chỉ nút xuất Forms bị tắt.

func (h *Handler) googleConfig() google.Config {
	return google.Config{
		ClientID:     h.Cfg.GoogleClientID,
		ClientSecret: h.Cfg.GoogleClientSecret,
		RedirectURL:  h.Cfg.GoogleRedirectURL,
		StateSecret:  h.Cfg.JWTSecret,
	}
}

// GoogleStatus handles GET /api/google/status.
func (h *Handler) GoogleStatus(c *gin.Context) {
	cfg := h.googleConfig()
	me := auth.CurrentUser(c)
	resp := gin.H{"configured": cfg.Configured(), "connected": false}
	if !cfg.Configured() {
		resp["reason"] = "Máy chủ chưa cấu hình GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URL."
		c.JSON(http.StatusOK, resp)
		return
	}
	var acc models.GoogleAccount
	if err := h.DB.Where("user_id = ?", me.ID).First(&acc).Error; err == nil {
		resp["connected"] = true
		resp["google_email"] = acc.GoogleEmail
		resp["connected_at"] = acc.ConnectedAt
	}
	c.JSON(http.StatusOK, resp)
}

// GoogleAuthURL handles GET /api/google/auth-url.
func (h *Handler) GoogleAuthURL(c *gin.Context) {
	cfg := h.googleConfig()
	if !cfg.Configured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "Máy chủ chưa cấu hình OAuth Google — liên hệ quản trị viên."})
		return
	}
	me := auth.CurrentUser(c)
	state := cfg.SignState(me.ID, 15*time.Minute)
	c.JSON(http.StatusOK, gin.H{"url": cfg.AuthURL(state)})
}

// GoogleCallback handles GET /api/google/callback — Google chuyển hướng trình
// duyệt về đây, KHÔNG kèm JWT, nên danh tính lấy từ chữ ký trong `state`.
func (h *Handler) GoogleCallback(c *gin.Context) {
	cfg := h.googleConfig()
	redirect := strings.TrimRight(h.Cfg.FrontendURL, "/") + "/cai-dat"

	fail := func(msg string) {
		c.Redirect(http.StatusFound, redirect+"?google=loi&msg="+urlQueryEscape(msg))
	}
	if e := c.Query("error"); e != "" {
		fail("Bạn đã từ chối cấp quyền cho ứng dụng.")
		return
	}
	userID, err := cfg.VerifyState(c.Query("state"))
	if err != nil {
		fail(err.Error())
		return
	}
	refresh, _, email, err := cfg.Exchange(c.Query("code"))
	if err != nil {
		fail(err.Error())
		return
	}
	enc, err := google.Encrypt(h.Cfg.TokenEncryptionKey, refresh)
	if err != nil {
		fail(err.Error())
		return
	}

	acc := models.GoogleAccount{
		UserID:          userID,
		GoogleEmail:     email,
		RefreshTokenEnc: enc,
		Scopes:          strings.Join(google.Scopes, " "),
		ConnectedAt:     time.Now(),
	}
	var existing models.GoogleAccount
	if err := h.DB.Where("user_id = ?", userID).First(&existing).Error; err == nil {
		acc.ID = existing.ID
		if err := h.DB.Model(&existing).Updates(map[string]any{
			"google_email":      acc.GoogleEmail,
			"refresh_token_enc": acc.RefreshTokenEnc,
			"scopes":            acc.Scopes,
			"connected_at":      acc.ConnectedAt,
		}).Error; err != nil {
			fail("Không lưu được liên kết.")
			return
		}
	} else if err := h.DB.Create(&acc).Error; err != nil {
		fail("Không lưu được liên kết.")
		return
	}
	c.Redirect(http.StatusFound, redirect+"?google=ok")
}

// GoogleDisconnect handles DELETE /api/google/account.
func (h *Handler) GoogleDisconnect(c *gin.Context) {
	me := auth.CurrentUser(c)
	if err := h.DB.Where("user_id = ?", me.ID).Delete(&models.GoogleAccount{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Không gỡ được liên kết"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"connected": false})
}

// googleAccessToken lấy access token cho user hiện tại, hoặc lỗi đã dịch sẵn
// sang tiếng Việt để hiện thẳng cho giáo viên.
func (h *Handler) googleAccessToken(userID uint) (string, error) {
	cfg := h.googleConfig()
	if !cfg.Configured() {
		return "", fmt.Errorf("máy chủ chưa cấu hình OAuth Google")
	}
	var acc models.GoogleAccount
	if err := h.DB.Where("user_id = ?", userID).First(&acc).Error; err != nil {
		return "", fmt.Errorf("bạn chưa nối tài khoản Google — vào trang Cài đặt để nối")
	}
	refresh, err := google.Decrypt(h.Cfg.TokenEncryptionKey, acc.RefreshTokenEnc)
	if err != nil {
		return "", err
	}
	token, err := cfg.AccessToken(refresh)
	if err != nil {
		return "", fmt.Errorf("%w — có thể bạn đã gỡ quyền của ứng dụng bên phía Google, hãy nối lại", err)
	}
	return token, nil
}

func urlQueryEscape(s string) string {
	r := strings.NewReplacer(" ", "%20", "&", "%26", "?", "%3F", "#", "%23", "+", "%2B")
	return r.Replace(s)
}
