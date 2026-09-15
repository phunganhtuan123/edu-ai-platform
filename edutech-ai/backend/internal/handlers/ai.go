package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ListModels proxies the Ollama server's GET /api/tags as [{name, size}].
func (h *Handler) ListModels(c *gin.Context) {
	models, err := h.Ollama.ListModels()
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Không kết nối được server Ollama: " + err.Error()})
		return
	}
	type modelOut struct {
		Name string `json:"name"`
		Size int64  `json:"size"`
	}
	out := make([]modelOut, 0, len(models))
	for _, m := range models {
		out = append(out, modelOut{Name: m.Name, Size: m.Size})
	}
	c.JSON(http.StatusOK, gin.H{"models": out, "default_model": h.Cfg.DefaultModel})
}
