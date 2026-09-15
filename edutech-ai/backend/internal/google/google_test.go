package google

import (
	"strings"
	"testing"
	"time"
)

func TestEncryptDecryptRoundTrip(t *testing.T) {
	enc, err := Encrypt("khoa-bi-mat", "refresh-token-abc")
	if err != nil {
		t.Fatalf("mã hoá lỗi: %v", err)
	}
	if strings.Contains(enc, "refresh-token-abc") {
		t.Fatalf("token vẫn lộ dạng thô trong chuỗi đã mã hoá")
	}
	got, err := Decrypt("khoa-bi-mat", enc)
	if err != nil || got != "refresh-token-abc" {
		t.Fatalf("giải mã sai: %q, %v", got, err)
	}
}

func TestDecryptWithWrongKeyFailsClearly(t *testing.T) {
	enc, _ := Encrypt("khoa-cu", "token")
	_, err := Decrypt("khoa-moi", enc)
	if err == nil {
		t.Fatalf("khoá sai mà vẫn giải mã được")
	}
	if !strings.Contains(err.Error(), "TOKEN_ENCRYPTION_KEY") {
		t.Fatalf("thông báo lỗi phải chỉ ra nguyên nhân thường gặp, có: %v", err)
	}
}

func TestEncryptRequiresKey(t *testing.T) {
	if _, err := Encrypt("", "token"); err == nil {
		t.Fatalf("thiếu khoá thì không được phép mã hoá")
	}
}

func TestStateSignVerify(t *testing.T) {
	c := Config{StateSecret: "s3cr3t"}
	st := c.SignState(42, time.Minute)
	id, err := c.VerifyState(st)
	if err != nil || id != 42 {
		t.Fatalf("verify sai: %d, %v", id, err)
	}
}

func TestStateRejectsTampering(t *testing.T) {
	c := Config{StateSecret: "s3cr3t"}
	st := c.SignState(42, time.Minute)
	// Đổi user id thành 43 nhưng giữ nguyên chữ ký.
	parts := strings.SplitN(st, ".", 2)
	if _, err := c.VerifyState("43." + parts[1]); err == nil {
		t.Fatalf("state bị sửa mà vẫn qua được")
	}
	// Chữ ký của khoá khác cũng phải bị từ chối.
	other := Config{StateSecret: "khac"}
	if _, err := c.VerifyState(other.SignState(42, time.Minute)); err == nil {
		t.Fatalf("chữ ký khoá khác mà vẫn qua được")
	}
}

func TestStateExpires(t *testing.T) {
	c := Config{StateSecret: "s3cr3t"}
	if _, err := c.VerifyState(c.SignState(1, -time.Minute)); err == nil {
		t.Fatalf("state hết hạn mà vẫn qua được")
	}
}

func TestAuthURLForcesRefreshToken(t *testing.T) {
	c := Config{ClientID: "id", ClientSecret: "sec", RedirectURL: "http://x/cb", StateSecret: "s"}
	u := c.AuthURL("st")
	for _, want := range []string{"access_type=offline", "prompt=consent", "forms.body"} {
		if !strings.Contains(u, want) {
			t.Fatalf("thiếu %q trong auth URL: %s", want, u)
		}
	}
}

func TestConfigured(t *testing.T) {
	if (Config{ClientID: "a", ClientSecret: "b"}).Configured() {
		t.Fatalf("thiếu redirect URL mà vẫn báo đã cấu hình")
	}
}
