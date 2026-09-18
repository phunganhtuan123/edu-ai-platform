// Package worker implements the in-process background job queue: a buffered
// channel feeding MAX_CONCURRENT_JOBS goroutines, so at most N Ollama calls
// run at once and the rest wait in line (spec section 4, job flow).
package worker

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
	"github.com/ai-for-edu/edutech-ai/backend/internal/ollama"
	"github.com/ai-for-edu/edutech-ai/backend/internal/pipelines"
)

type Pool struct {
	db     *gorm.DB
	client usageChatter
	queue  chan uint
}

type usageChatter interface {
	ChatStructuredWithUsage(model, system, user string, schema map[string]any) (ollama.ChatResult, error)
}

// jobUsageChatter belongs to exactly one job. It accumulates every Ollama call
// that returned complete counts, including calls before a later failure.
// Separate job-local instances prevent concurrent workers from mixing usage.
type jobUsageChatter struct {
	client usageChatter
	mu     sync.Mutex
	usage  ollama.Usage
}

func newJobUsageChatter(client usageChatter) *jobUsageChatter {
	return &jobUsageChatter{client: client}
}

func (c *jobUsageChatter) ChatStructured(model, system, user string, schema map[string]any) (string, error) {
	result, err := c.client.ChatStructuredWithUsage(model, system, user, schema)
	c.mu.Lock()
	if result.Usage.Recorded {
		c.usage.PromptTokens += result.Usage.PromptTokens
		c.usage.CompletionTokens += result.Usage.CompletionTokens
		c.usage.TotalTokens += result.Usage.TotalTokens
		c.usage.Recorded = true
	}
	c.mu.Unlock()
	return result.Content, err
}

func (c *jobUsageChatter) Usage() ollama.Usage {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.usage
}

func usageUpdates(tracker *jobUsageChatter) map[string]any {
	usage := tracker.Usage()
	return map[string]any{
		"prompt_tokens":     usage.PromptTokens,
		"completion_tokens": usage.CompletionTokens,
		"total_tokens":      usage.TotalTokens,
		"usage_recorded":    usage.Recorded,
	}
}

func mergeUpdates(base, extra map[string]any) map[string]any {
	for key, value := range extra {
		base[key] = value
	}
	return base
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

	usageTracker := newJobUsageChatter(p.client)
	result, err := pipelines.Run(usageTracker, job.Model, job.Type, json.RawMessage(job.Input), onProgress)
	finished := time.Now()
	if err != nil {
		log.Printf("worker: job %d thất bại: %v", job.ID, err)
		p.db.Model(&job).Updates(mergeUpdates(map[string]any{
			"status":      models.JobFailed,
			"error":       err.Error(),
			"finished_at": &finished,
		}, usageUpdates(usageTracker)))
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
		p.db.Model(&job).Updates(mergeUpdates(map[string]any{
			"status":      models.JobFailed,
			"error":       "không serialize được kết quả: " + err.Error(),
			"finished_at": &finished,
		}, usageUpdates(usageTracker)))
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
		return tx.Model(&models.Job{}).Where("id = ?", job.ID).Updates(mergeUpdates(map[string]any{
			"status":      models.JobDone,
			"finished_at": &finished,
		}, usageUpdates(usageTracker))).Error
	})
	if err != nil {
		log.Printf("worker: job %d không lưu được kết quả: %v", job.ID, err)
		p.db.Model(&job).Updates(mergeUpdates(map[string]any{
			"status":      models.JobFailed,
			"error":       "không lưu được kết quả: " + err.Error(),
			"finished_at": &finished,
		}, usageUpdates(usageTracker)))
		return
	}
	log.Printf("worker: job %d xong sau %s (%d cảnh báo)", job.ID, finished.Sub(now).Round(time.Second), len(result.Warnings))
}
