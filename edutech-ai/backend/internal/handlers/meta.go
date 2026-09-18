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

// Project subjects. JobTypeAllowedForProject still keeps the existing English
// modules restricted to English THCS/THPT projects.
var Subjects = []CatalogEntry{
	{Key: "english", Name: "Tiếng Anh", Enabled: true},
	{Key: SubjectMamNon, Name: "Giáo dục mầm non", Enabled: true},
	{Key: "math", Name: "Toán", Enabled: true},
	{Key: "science", Name: "Khoa học tự nhiên", Enabled: true},
	{Key: "literature", Name: "Ngữ văn", Enabled: true},
}

// GradeLevels available for projects and the lesson-plan module.
var GradeLevels = []CatalogEntry{
	{Key: GradeMamNon, Name: "Mầm non", Enabled: true},
	{Key: "tieuhoc", Name: "Tiểu học", Enabled: true},
	{Key: "thcs", Name: "THCS", Enabled: true},
	{Key: "thpt", Name: "THPT", Enabled: true},
}

// Mầm non không có môn học: project mầm non luôn đi với "Giáo dục mầm non" và
// ngược lại. Kiểm ở API (CreateProject), frontend chỉ tự chọn giúp.
const (
	GradeMamNon   = "mamnon"
	SubjectMamNon = "mamnon_chung"
)

// SubjectGradeCompatible reports whether the subject/grade pair makes sense.
func SubjectGradeCompatible(subject, grade string) bool {
	return (subject == SubjectMamNon) == (grade == GradeMamNon)
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

// MindmapMeta serves GET /api/meta/mindmap — loại sơ đồ, nhóm tuổi và lĩnh vực
// phát triển (spec mục 2e). Frontend render từ đây, không hardcode.
func (h *Handler) MindmapMeta(c *gin.Context) {
	domains := map[string][]pipelines.MetaOption{}
	for _, a := range pipelines.AgeGroups {
		domains[a.Key] = pipelines.DomainsFor(a.Key)
	}
	c.JSON(http.StatusOK, gin.H{
		"map_types":  pipelines.MindmapTypes,
		"age_groups": pipelines.AgeGroups,
		"domains":    domains,
		"notice":     "Sơ đồ do AI gợi ý — giáo viên điều chỉnh cho phù hợp lớp mình trước khi dùng.",
	})
}
