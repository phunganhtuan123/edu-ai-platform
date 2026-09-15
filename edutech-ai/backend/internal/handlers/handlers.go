// Package handlers implements the REST API (spec section 6).
package handlers

import (
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/config"
	"github.com/ai-for-edu/edutech-ai/backend/internal/ollama"
	"github.com/ai-for-edu/edutech-ai/backend/internal/worker"
)

type Handler struct {
	DB     *gorm.DB
	Cfg    *config.Config
	Ollama *ollama.Client
	Worker *worker.Pool
}

func New(db *gorm.DB, cfg *config.Config, client *ollama.Client, pool *worker.Pool) *Handler {
	return &Handler{DB: db, Cfg: cfg, Ollama: client, Worker: pool}
}
