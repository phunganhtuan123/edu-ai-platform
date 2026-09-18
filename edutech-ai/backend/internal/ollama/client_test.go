package ollama

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChatStructuredWithUsageReturnsActualOllamaCounts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/chat" {
			t.Fatalf("path = %q, cần /api/chat", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"message":{"role":"assistant","content":"{\"ok\":true}"},
			"prompt_eval_count":17,
			"eval_count":9
		}`))
	}))
	defer server.Close()

	result, err := New(server.URL).ChatStructuredWithUsage("model", "system", "user", map[string]any{"type": "object"})
	if err != nil {
		t.Fatalf("ChatStructuredWithUsage lỗi: %v", err)
	}
	if result.Content != `{"ok":true}` {
		t.Fatalf("content = %q", result.Content)
	}
	if result.Usage.PromptTokens != 17 || result.Usage.CompletionTokens != 9 || result.Usage.TotalTokens != 26 {
		t.Fatalf("usage không lấy đúng từ Ollama: %+v", result.Usage)
	}
	if !result.Usage.Recorded {
		t.Fatalf("đủ hai count phải được đánh dấu đã ghi nhận")
	}
}

func TestChatStructuredWithUsageDoesNotInventMissingCounts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"message":{"content":"{}"}}`))
	}))
	defer server.Close()

	result, err := New(server.URL).ChatStructuredWithUsage("model", "system", "user", map[string]any{"type": "object"})
	if err != nil {
		t.Fatalf("call hợp lệ không được lỗi: %v", err)
	}
	if result.Usage.Recorded {
		t.Fatalf("thiếu count không được giả thành usage 0 đã ghi nhận: %+v", result.Usage)
	}
}
