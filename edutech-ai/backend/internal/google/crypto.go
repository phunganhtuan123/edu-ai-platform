// Package google nối tài khoản Google của từng giáo viên và xuất đề sang
// Google Forms (spec mục 2b).
//
// Cố ý KHÔNG dùng thư viện client của Google: chỉ cần vài lời gọi REST, thêm
// SDK là kéo theo hàng chục dependency. Tất cả dùng net/http chuẩn.
package google

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// Refresh token là chìa khoá vào tài khoản Google của giáo viên, nên không bao
// giờ nằm dạng thô trong DB: mã hoá AES-256-GCM, khoá lấy từ
// TOKEN_ENCRYPTION_KEY băm SHA-256 (nhận khoá dài ngắn tuỳ ý).
func aead(secret string) (cipher.AEAD, error) {
	if secret == "" {
		return nil, errors.New("thiếu TOKEN_ENCRYPTION_KEY — không thể lưu token Google an toàn")
	}
	sum := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func Encrypt(secret, plain string) (string, error) {
	gcm, err := aead(secret)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	out := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

func Decrypt(secret, encoded string) (string, error) {
	gcm, err := aead(secret)
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("token đã lưu bị hỏng")
	}
	nonce, body := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, body, nil)
	if err != nil {
		// Thường gặp nhất: TOKEN_ENCRYPTION_KEY bị đổi sau khi user đã nối.
		return "", errors.New("không giải mã được token Google — nhiều khả năng TOKEN_ENCRYPTION_KEY đã thay đổi, giáo viên cần nối lại tài khoản")
	}
	return string(plain), nil
}
