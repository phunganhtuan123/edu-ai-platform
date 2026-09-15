package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/ai-for-edu/edutech-ai/backend/internal/pipelines"
)

// CatalogEntry is one subject or grade level with its enabled flag. The
// frontend renders disabled buttons from this — nothing hardcoded there.
type CatalogEntry struct {
	Key     string `json:"key"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
}

// Subjects available in the MVP: only English is enabled.
var Subjects = []CatalogEntry{
	{Key: "english", Name: "Tiếng Anh", Enabled: true},
	{Key: "math", Name: "Toán", Enabled: false},
	{Key: "science", Name: "Khoa học tự nhiên", Enabled: false},
	{Key: "literature", Name: "Ngữ văn", Enabled: false},
}

// GradeLevels available in the MVP: THCS and THPT enabled.
var GradeLevels = []CatalogEntry{
	{Key: "mamnon", Name: "Mầm non", Enabled: false},
	{Key: "tieuhoc", Name: "Tiểu học", Enabled: false},
	{Key: "thcs", Name: "THCS", Enabled: true},
	{Key: "thpt", Name: "THPT", Enabled: true},
}

// Catalog serves GET /api/meta/catalog.
func (h *Handler) Catalog(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"subjects":     Subjects,
		"grade_levels": GradeLevels,
	})
}

// SubjectEnabled reports whether the subject key exists and is enabled.
func SubjectEnabled(key string) bool {
	for _, s := range Subjects {
		if s.Key == key {
			return s.Enabled
		}
	}
	return false
}

// GradeLevelEnabled reports whether the grade level key exists and is enabled.
func GradeLevelEnabled(key string) bool {
	for _, g := range GradeLevels {
		if g.Key == key {
			return g.Enabled
		}
	}
	return false
}

// ExamParts serves GET /api/meta/exam-parts — bảng phần thi THPT (spec mục 2a),
// mức độ khó, và giới hạn ký tự ngữ liệu. Frontend render từ đây; KHÔNG
// hardcode danh sách phần thi ở frontend, nếu không hai nơi sẽ lệch nhau đúng
// như hai app của EdTech Corner.
func (h *Handler) ExamParts(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"exam_parts":   pipelines.ExamParts,
		"difficulties": pipelines.DifficultyLevels,
		"source_modes": []gin.H{
			{"key": pipelines.SourceModeKeep, "name_vi": "Giữ nguyên văn bản gốc",
				"hint": "Dùng đúng đoạn văn bạn dán làm ngữ liệu."},
			{"key": pipelines.SourceModeRewrite, "name_vi": "Để AI viết lại",
				"hint": "Sinh đoạn mới cùng chủ đề — dùng khi ngữ liệu gốc có bản quyền hoặc học sinh đã đọc rồi."},
		},
		"source_limits": gin.H{
			"min_chars": h.Cfg.MinSourceChars,
			"max_chars": h.Cfg.MaxSourceChars,
		},
		"difficulty_notice": "Mức độ khó do AI diễn giải nên có thể lệch — giáo viên vui lòng duyệt lại.",
	})
}
