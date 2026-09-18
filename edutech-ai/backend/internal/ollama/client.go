// Package ollama is a small client for the Ollama HTTP API: ListModels
// (GET /api/tags) and ChatStructured (POST /api/chat with a JSON-schema
// "format", non-streaming) — the same call pattern proven in edu-cli.
package ollama

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	http    *http.Client
}

// New creates a client. Chat calls can take minutes on local models, so the
// HTTP timeout is long (30 min).
func New(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http:    &http.Client{Timeout: 30 * time.Minute},
	}
}

// ModelInfo is one entry from GET /api/tags.
type ModelInfo struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
}

type tagsResponse struct {
	Models []ModelInfo `json:"models"`
}

// ListModels returns the models available on the Ollama server.
func (c *Client) ListModels() ([]ModelInfo, error) {
	resp, err := c.http.Get(c.baseURL + "/api/tags")
	if err != nil {
		return nil, fmt.Errorf("không kết nối được Ollama (%s): %w", c.baseURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("ollama /api/tags trả về %d: %s", resp.StatusCode, string(body))
	}
	var tags tagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&tags); err != nil {
		return nil, fmt.Errorf("không đọc được phản hồi /api/tags: %w", err)
	}
	return tags.Models, nil
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string         `json:"model"`
	Messages []chatMessage  `json:"messages"`
	Format   map[string]any `json:"format"`
	Stream   bool           `json:"stream"`
	Options  map[string]any `json:"options"`
}

type chatResponse struct {
	Message struct {
		Content string `json:"content"`
	} `json:"message"`
	Error           string `json:"error"`
	PromptEvalCount *int64 `json:"prompt_eval_count"`
	EvalCount       *int64 `json:"eval_count"`
}

// Usage contains Ollama's measured token counts for one completed chat call.
type Usage struct {
	PromptTokens     int64 `json:"prompt_tokens"`
	CompletionTokens int64 `json:"completion_tokens"`
	TotalTokens      int64 `json:"total_tokens"`
	Recorded         bool  `json:"recorded"`
}

// ChatResult keeps the structured content and the usage reported for the
// same HTTP response together, so callers cannot accidentally mix jobs.
type ChatResult struct {
	Content string
	Usage   Usage
}

// ChatStructured calls POST /api/chat with structured output enforced by the
// given JSON schema and returns the message content (guaranteed valid JSON by
// Ollama when a schema is supplied). Mirrors edu-cli: temperature 0.4,
// num_ctx 8192, stream=false, long timeout.
func (c *Client) ChatStructured(model, system, user string, schema map[string]any) (string, error) {
	result, err := c.ChatStructuredWithUsage(model, system, user, schema)
	return result.Content, err
}

// ChatStructuredWithUsage is ChatStructured plus the actual
// prompt_eval_count/eval_count returned by Ollama.
func (c *Client) ChatStructuredWithUsage(model, system, user string, schema map[string]any) (ChatResult, error) {
	reqBody := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		Format: schema,
		Stream: false,
		Options: map[string]any{
			"temperature": 0.4,
			"num_ctx":     8192,
		},
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return ChatResult{}, err
	}
	resp, err := c.http.Post(c.baseURL+"/api/chat", "application/json", bytes.NewReader(payload))
	if err != nil {
		return ChatResult{}, fmt.Errorf("không gọi được Ollama (%s): %w", c.baseURL, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return ChatResult{}, fmt.Errorf("không đọc được phản hồi Ollama: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return ChatResult{}, fmt.Errorf("ollama /api/chat trả về %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var chat chatResponse
	if err := json.Unmarshal(body, &chat); err != nil {
		return ChatResult{}, fmt.Errorf("phản hồi Ollama không phải JSON: %w", err)
	}
	result := ChatResult{Content: chat.Message.Content}
	if chat.PromptEvalCount != nil {
		result.Usage.PromptTokens = *chat.PromptEvalCount
	}
	if chat.EvalCount != nil {
		result.Usage.CompletionTokens = *chat.EvalCount
	}
	result.Usage.TotalTokens = result.Usage.PromptTokens + result.Usage.CompletionTokens
	result.Usage.Recorded = chat.PromptEvalCount != nil && chat.EvalCount != nil
	if chat.Error != "" {
		return result, fmt.Errorf("ollama báo lỗi: %s", chat.Error)
	}
	return result, nil
}
