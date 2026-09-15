package google

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// FormQuestion là một câu đã chuẩn hoá, sẵn sàng đẩy lên Google Forms.
type FormQuestion struct {
	Number      int
	Prompt      string
	Options     []string
	AnswerIndex int
	Explanation string
	Points      int
}

// FormBlock là một khối nội dung của form: đoạn văn hiển thị (không chấm điểm)
// rồi tới các câu hỏi của khối đó.
type FormBlock struct {
	Heading     string
	Instruction string
	Passage     string
	Questions   []FormQuestion
}

type FormResult struct {
	FormID       string `json:"form_id"`
	EditURL      string `json:"edit_url"`
	ResponderURL string `json:"responder_url"`
}

func doJSON(method, url, accessToken string, body any, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("không gọi được Google Forms: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("Google Forms trả mã %d: %s", resp.StatusCode, truncate(string(raw), 400))
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// CreateQuiz tạo một form ở chế độ bài kiểm tra rồi đẩy từng khối vào.
//
// Forms API bắt buộc chia hai bước: tạo form chỉ với tiêu đề, rồi batchUpdate
// mọi thứ còn lại — không thể tạo kèm câu hỏi trong một lời gọi.
func CreateQuiz(accessToken, title string, blocks []FormBlock) (*FormResult, error) {
	var created struct {
		FormID       string `json:"formId"`
		ResponderURI string `json:"responderUri"`
	}
	err := doJSON("POST", "https://forms.googleapis.com/v1/forms", accessToken,
		map[string]any{"info": map[string]any{
			"title":         title,
			"documentTitle": title,
		}}, &created)
	if err != nil {
		return nil, err
	}

	requests := []map[string]any{
		// Phải bật chế độ quiz TRƯỚC khi thêm câu hỏi, nếu không phần chấm
		// điểm của từng câu sẽ bị Forms từ chối.
		{"updateSettings": map[string]any{
			"settings":   map[string]any{"quizSettings": map[string]any{"isQuiz": true}},
			"updateMask": "quizSettings.isQuiz",
		}},
	}
	index := 0
	for _, blk := range blocks {
		if head := strings.TrimSpace(blk.Heading); head != "" || blk.Passage != "" || blk.Instruction != "" {
			desc := strings.TrimSpace(strings.TrimSpace(blk.Instruction) + "\n\n" + strings.TrimSpace(blk.Passage))
			if head == "" {
				head = "Phần đọc"
			}
			requests = append(requests, map[string]any{"createItem": map[string]any{
				"item": map[string]any{
					"title":       head,
					"description": desc,
					"textItem":    map[string]any{},
				},
				"location": map[string]any{"index": index},
			}})
			index++
		}
		for _, q := range blk.Questions {
			opts := make([]map[string]any, 0, len(q.Options))
			for _, o := range q.Options {
				opts = append(opts, map[string]any{"value": o})
			}
			if q.AnswerIndex < 0 || q.AnswerIndex >= len(q.Options) {
				return nil, fmt.Errorf("câu %d có đáp án không hợp lệ", q.Number)
			}
			points := q.Points
			if points <= 0 {
				points = 1
			}
			grading := map[string]any{
				"pointValue": points,
				"correctAnswers": map[string]any{
					"answers": []map[string]any{{"value": q.Options[q.AnswerIndex]}},
				},
			}
			if fb := strings.TrimSpace(q.Explanation); fb != "" {
				grading["whenRight"] = map[string]any{"text": fb}
				grading["whenWrong"] = map[string]any{"text": fb}
			}
			requests = append(requests, map[string]any{"createItem": map[string]any{
				"item": map[string]any{
					"title": fmt.Sprintf("Question %d", q.Number),
					"questionItem": map[string]any{
						"question": map[string]any{
							"required": false,
							"grading":  grading,
							"choiceQuestion": map[string]any{
								"type":    "RADIO",
								"options": opts,
								// Vị trí đáp án đã được code của mình xáo từ
								// trước; để Forms xáo thêm sẽ làm đề in ra và
								// đề online lệch nhau.
								"shuffle": false,
							},
						},
					},
				},
				"location": map[string]any{"index": index},
			}})
			if d := strings.TrimSpace(q.Prompt); d != "" {
				requests[len(requests)-1]["createItem"].(map[string]any)["item"].(map[string]any)["description"] = d
			}
			index++
		}
	}

	if err := doJSON("POST",
		"https://forms.googleapis.com/v1/forms/"+created.FormID+":batchUpdate",
		accessToken, map[string]any{"requests": requests}, nil); err != nil {
		// Form rỗng đã được tạo trên Drive của giáo viên — nói rõ để họ xoá.
		return nil, fmt.Errorf("%w (một form rỗng đã được tạo trong Google Drive, bạn có thể xoá)", err)
	}

	return &FormResult{
		FormID:       created.FormID,
		EditURL:      "https://docs.google.com/forms/d/" + created.FormID + "/edit",
		ResponderURL: created.ResponderURI,
	}, nil
}
