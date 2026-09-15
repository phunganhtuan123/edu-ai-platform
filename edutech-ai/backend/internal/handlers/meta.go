package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
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
