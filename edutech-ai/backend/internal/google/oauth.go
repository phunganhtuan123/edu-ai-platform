package google

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Scope tối thiểu: tạo form, thấy được file mình tạo, và biết email tài khoản
// vừa nối (để hiện cho giáo viên biết đang nối nhầm tài khoản hay không).
var Scopes = []string{
	"https://www.googleapis.com/auth/forms.body",
	"https://www.googleapis.com/auth/drive.file",
	"https://www.googleapis.com/auth/userinfo.email",
}

type Config struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
	StateSecret  string
}

func (c Config) Configured() bool {
	return c.ClientID != "" && c.ClientSecret != "" && c.RedirectURL != ""
}

// SignState gắn user id vào tham số state kèm chữ ký HMAC: callback của Google
// quay về không mang header Authorization, nên state phải tự chứng minh được
// nó thuộc về ai và chưa bị sửa.
func (c Config) SignState(userID uint, ttl time.Duration) string {
	payload := fmt.Sprintf("%d.%d", userID, time.Now().Add(ttl).Unix())
	mac := hmac.New(sha256.New, []byte(c.StateSecret))
	mac.Write([]byte(payload))
	return payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (c Config) VerifyState(state string) (uint, error) {
	parts := strings.Split(state, ".")
	if len(parts) != 3 {
		return 0, fmt.Errorf("state không hợp lệ")
	}
	payload := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(c.StateSecret))
	mac.Write([]byte(payload))
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(parts[2])) {
		return 0, fmt.Errorf("state bị sửa hoặc không đúng chữ ký")
	}
	exp, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return 0, fmt.Errorf("liên kết đã hết hạn, bấm nối lại")
	}
	id, err := strconv.ParseUint(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("state không hợp lệ")
	}
	return uint(id), nil
}

func (c Config) AuthURL(state string) string {
	q := url.Values{}
	q.Set("client_id", c.ClientID)
	q.Set("redirect_uri", c.RedirectURL)
	q.Set("response_type", "code")
	q.Set("scope", strings.Join(Scopes, " "))
	// access_type=offline + prompt=consent để CHẮC CHẮN nhận được refresh
	// token: Google chỉ trả refresh token ở lần cấp quyền đầu tiên, nếu không
	// ép prompt thì lần nối lại sẽ không có token và tính năng chết âm thầm.
	q.Set("access_type", "offline")
	q.Set("prompt", "consent")
	q.Set("include_granted_scopes", "true")
	q.Set("state", state)
	return "https://accounts.google.com/o/oauth2/v2/auth?" + q.Encode()
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	Error        string `json:"error"`
	ErrorDesc    string `json:"error_description"`
}

var httpClient = &http.Client{Timeout: 30 * time.Second}

func (c Config) postToken(form url.Values) (*tokenResponse, error) {
	resp, err := httpClient.PostForm("https://oauth2.googleapis.com/token", form)
	if err != nil {
		return nil, fmt.Errorf("không gọi được Google: %w", err)
	}
	defer resp.Body.Close()
	var tr tokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return nil, fmt.Errorf("Google trả dữ liệu không đọc được: %w", err)
	}
	if tr.Error != "" {
		return nil, fmt.Errorf("Google từ chối: %s (%s)", tr.Error, tr.ErrorDesc)
	}
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("Google trả mã %d", resp.StatusCode)
	}
	return &tr, nil
}

// Exchange đổi mã uỷ quyền lấy token, và trả kèm email của tài khoản vừa nối.
func (c Config) Exchange(code string) (refreshToken, accessToken, email string, err error) {
	tr, err := c.postToken(url.Values{
		"code":          {code},
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"redirect_uri":  {c.RedirectURL},
		"grant_type":    {"authorization_code"},
	})
	if err != nil {
		return "", "", "", err
	}
	if tr.RefreshToken == "" {
		return "", "", "", fmt.Errorf("Google không cấp refresh token — vào https://myaccount.google.com/permissions gỡ quyền của ứng dụng rồi nối lại")
	}
	email, _ = c.userEmail(tr.AccessToken)
	return tr.RefreshToken, tr.AccessToken, email, nil
}

// AccessToken đổi refresh token lấy access token mới cho một lần gọi API.
func (c Config) AccessToken(refreshToken string) (string, error) {
	tr, err := c.postToken(url.Values{
		"refresh_token": {refreshToken},
		"client_id":     {c.ClientID},
		"client_secret": {c.ClientSecret},
		"grant_type":    {"refresh_token"},
	})
	if err != nil {
		return "", err
	}
	return tr.AccessToken, nil
}

func (c Config) userEmail(accessToken string) (string, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	return out.Email, nil
}
