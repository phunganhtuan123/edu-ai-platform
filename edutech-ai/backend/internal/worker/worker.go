// Package worker implements the in-process background job queue: a buffered
// channel feeding MAX_CONCURRENT_JOBS goroutines, so at most N Ollama calls
// run at once and the rest wait in line (spec section 4, job flow).
package worker

import (
	"encoding/json"
	"log"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
	"github.com/ai-for-edu/edutech-ai/backend/internal/ollama"
	"github.com/ai-for-edu/edutech-ai/backend/internal/pipelines"
)

type Pool struct {
	db     *gorm.DB
	client *ollama.Client
	queue  chan uint
}

// New creates a pool with the given concurrency cap.
func New(db *gorm.DB, client *ollama.Client, concurrency int) *Pool {
	if concurrency < 1 {
		concurrency = 1
	}
	p := &Pool{
		db:     db,
		client: client,
		queue:  make(chan uint, 1024),
	}
	for i := 0; i < concurrency; i++ {
		go p.workerLoop()
	}
	return p
}

// Start re-enqueues jobs left in 'queued' state by a previous run (e.g. the
// server restarted before a worker picked them up).
func (p *Pool) Start() {
	var stale []models.Job
	if err := p.db.Where("status = ?", models.JobQueued).Order("created_at asc").Find(&stale).Error; err != nil {
		log.Printf("worker: không đọc được job tồn đọng: %v", err)
		return
	}
	for _, j := range stale {
		p.Enqueue(j.ID)
	}
	if len(stale) > 0 {
		log.Printf("worker: xếp lại %d job tồn đọng vào hàng đợi", len(stale))
	}
}

// Enqueue adds a queued job (by ID) to the in-process queue.
func (p *Pool) Enqueue(jobID uint) {
	select {
	case p.queue <- jobID:
	default:
		// Queue full: leave the job 'queued' in DB; it will be picked up on
		// the next restart. With a 1024 buffer this should never happen in MVP.
		log.Printf("worker: hàng đợi đầy, job %d chờ lần khởi động sau", jobID)
	}
}

func (p *Pool) workerLoop() {
	for jobID := range p.queue {
		p.process(jobID)
	}
}

func (p *Pool) process(jobID uint) {
	var job models.Job
	if err := p.db.First(&job, jobID).Error; err != nil {
		log.Printf("worker: job %d không tồn tại: %v", jobID, err)
		return
	}
	if job.Status != models.JobQueued {
		return // already handled (double enqueue after restart, etc.)
	}

	now := time.Now()
	if err := p.db.Model(&job).Updates(map[string]any{
		"status":     models.JobRunning,
		"started_at": &now,
	}).Error; err != nil {
		log.Printf("worker: job %d không chuyển được sang running: %v", jobID, err)
		return
	}
	log.Printf("worker: job %d (%s) bắt đầu, model=%s", job.ID, job.Type, job.Model)

	// Callback ghi tiến độ vào DB để frontend polling đọc được. Lỗi ghi không
	// làm hỏng job — tiến độ chỉ là thông tin hiển thị.
	onProgress := func(current, total int, label string) {
		b, err := json.Marshal(map[string]any{"current": current, "total": total, "label": label})
		if err != nil {
			return
		}
		if err := p.db.Model(&models.Job{}).Where("id = ?", job.ID).
			Update("progress", datatypes.JSON(b)).Error; err != nil {
			log.Printf("worker: job %d không ghi được tiến độ: %v", job.ID, err)
		}
	}

	result, err := pipelines.Run(p.client, job.Model, job.Type, json.RawMessage(job.Input), onProgress)
	finished := time.Now()
	if err != nil {
		log.Printf("worker: job %d thất bại: %v", job.ID, err)
		p.db.Model(&job).Updates(map[string]any{
			"status":      models.JobFailed,
			"error":       err.Error(),
			"finished_at": &finished,
		})
		return
	}

	// Validation warnings ship inside the artifact content so the teacher
	// reviews them in the UI.
	content := result.Content
	if content == nil {
		content = map[string]any{}
	}
	if result.Warnings == nil {
		content["warnings"] = []string{}
	} else {
		content["warnings"] = result.Warnings
	}
	contentJSON, err := json.Marshal(content)
	if err != nil {
		p.db.Model(&job).Updates(map[string]any{
			"status":      models.JobFailed,
			"error":       "không serialize được kết quả: " + err.Error(),
			"finished_at": &finished,
		})
		return
	}

	artifact := models.Artifact{
		JobID:     job.ID,
		ProjectID: job.ProjectID,
		Type:      job.Type,
		Title:     result.Title,
		Content:   contentJSON,
	}
	err = p.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&artifact).Error; err != nil {
			return err
		}
		return tx.Model(&models.Job{}).Where("id = ?", job.ID).Updates(map[string]any{
			"status":      models.JobDone,
			"finished_at": &finished,
		}).Error
	})
	if err != nil {
		log.Printf("worker: job %d không lưu được kết quả: %v", job.ID, err)
		p.db.Model(&job).Updates(map[string]any{
			"status":      models.JobFailed,
			"error":       "không lưu được kết quả: " + err.Error(),
			"finished_at": &finished,
		})
		return
	}
	log.Printf("worker: job %d xong sau %s (%d cảnh báo)", job.ID, finished.Sub(now).Round(time.Second), len(result.Warnings))
}
