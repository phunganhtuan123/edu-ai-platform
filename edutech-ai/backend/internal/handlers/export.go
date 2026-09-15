package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/datatypes"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/google"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

// Xuất artifact sang Google Forms (spec mục 2b).

// artifactContent là hình dạng chung của content: đề nhiều phần (exam,
// template_generate) dùng `parts`, quiz dùng `questions` ở gốc.
type artifactContent struct {
	Parts []struct {
		PartName    string `json:"part_name"`
		Instruction string `json:"instruction"`
		Passage     string `json:"passage"`
		Items       []struct {
			ExamNumber  int      `json:"exam_number"`
			Prompt      string   `json:"prompt"`
			Options     []string `json:"options"`
			AnswerIndex int      `json:"answer_index"`
			Explanation string   `json:"explanation"`
		} `json:"items"`
	} `json:"parts"`
	Questions []struct {
		Question    string   `json:"question"`
		Options     []string `json:"options"`
		AnswerIndex int      `json:"answer_index"`
		Explanation string   `json:"explanation"`
	} `json:"questions"`
}

// toFormBlocks dịch content của artifact sang khối Google Forms.
func toFormBlocks(raw []byte) ([]google.FormBlock, int) {
	var c artifactContent
	if err := json.Unmarshal(raw, &c); err != nil {
		return nil, 0
	}
	var blocks []google.FormBlock
	total := 0

	for _, p := range c.Parts {
		blk := google.FormBlock{
			Heading:     p.PartName,
			Instruction: p.Instruction,
			Passage:     p.Passage,
		}
		for _, it := range p.Items {
			n := it.ExamNumber
			if n == 0 {
				n = total + 1
			}
			blk.Questions = append(blk.Questions, google.FormQuestion{
				Number:      n,
				Prompt:      it.Prompt,
				Options:     it.Options,
				AnswerIndex: it.AnswerIndex,
				Explanation: it.Explanation,
			})
			total++
		}
		if len(blk.Questions) > 0 {
			blocks = append(blocks, blk)
		}
	}

	if len(blocks) == 0 && len(c.Questions) > 0 {
		blk := google.FormBlock{}
		for i, q := range c.Questions {
			blk.Questions = append(blk.Questions, google.FormQuestion{
				Number:      i + 1,
				Prompt:      q.Question,
				Options:     q.Options,
				AnswerIndex: q.AnswerIndex,
				Explanation: q.Explanation,
			})
			total++
		}
		blocks = append(blocks, blk)
	}
	return blocks, total
}

// ExportGoogleForms handles POST /api/artifacts/:id/export/google-forms.
func (h *Handler) ExportGoogleForms(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID không hợp lệ"})
		return
	}
	me := auth.CurrentUser(c)

	var artifact models.Artifact
	if err := h.DB.First(&artifact, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy kết quả"})
		return
	}
	// Chỉ chủ project mới xuất được — kiểm qua project, không tin artifact.
	var project models.Project
	if err := h.DB.First(&project, artifact.ProjectID).Error; err != nil ||
		(project.UserID != me.ID && me.Role != models.RoleAdmin) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Không tìm thấy kết quả"})
		return
	}

	switch artifact.Type {
	case models.JobTypeQuiz, models.JobTypeExam, models.JobTypeTemplateGenerate:
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Chỉ xuất được trắc nghiệm và đề thi sang Google Forms"})
		return
	}

	blocks, total := toFormBlocks(artifact.Content)
	if total == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Kết quả này không có câu hỏi nào để xuất"})
		return
	}

	token, err := h.googleAccessToken(me.ID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	title := strings.TrimSpace(artifact.Title)
	if title == "" {
		title = "Đề kiểm tra"
	}
	res, err := google.CreateQuiz(token, title, blocks)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"form_id":       res.FormID,
		"edit_url":      res.EditURL,
		"responder_url": res.ResponderURL,
		"exported_at":   time.Now(),
	})
	if err := h.DB.Model(&artifact).Update("google_form", datatypes.JSON(payload)).Error; err != nil {
		// Form đã tạo xong rồi; không ghi được DB thì vẫn phải trả link cho
		// giáo viên, chỉ là lần sau mở lại sẽ không thấy link cũ.
		c.JSON(http.StatusOK, gin.H{
			"form":    res,
			"warning": "Đã tạo form nhưng không lưu được link vào hệ thống — hãy lưu lại link ngay.",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"form": res, "question_count": total})
}
