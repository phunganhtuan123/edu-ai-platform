// Package models defines the GORM data model per spec section 5:
// users, projects, jobs, artifacts.
package models

import (
	"time"

	"gorm.io/datatypes"
)

// User roles.
const (
	RoleAdmin   = "admin"
	RoleTeacher = "teacher"
)

// User statuses: pending -> active <-> disabled -> (deleted).
const (
	StatusPending  = "pending"
	StatusActive   = "active"
	StatusDisabled = "disabled"
)

// Job statuses.
const (
	JobQueued  = "queued"
	JobRunning = "running"
	JobDone    = "done"
	JobFailed  = "failed"
)

// Job types.
const (
	JobTypeQuiz       = "quiz"
	JobTypeExam       = "exam"
	JobTypeWriting    = "writing"
	JobTypeActivity   = "activity"
	JobTypeLessonPlan = "lesson_plan"
	// Module 5 chạy hai bước: phân tích cấu trúc mẫu, rồi sinh nội dung mới.
	JobTypeTemplateAnalyze  = "template_analyze"
	JobTypeTemplateGenerate = "template_generate"
	// Module 6 — sơ đồ tư duy cho cấp mầm non.
	JobTypeMindmap = "mindmap"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Email        string    `gorm:"uniqueIndex;size:255;not null" json:"email"`
	PasswordHash string    `gorm:"not null" json:"-"`
	Name         string    `gorm:"size:255" json:"name"`
	Role         string    `gorm:"size:16;not null;default:teacher" json:"role"`
	Status       string    `gorm:"size:16;not null;default:pending" json:"status"`
	CreatedAt    time.Time `json:"created_at"`
}

type Project struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"user_id"`
	Name       string    `gorm:"size:255;not null" json:"name"`
	Subject    string    `gorm:"size:32;not null" json:"subject"`
	GradeLevel string    `gorm:"size:32;not null" json:"grade_level"`
	CreatedAt  time.Time `json:"created_at"`
}

type Job struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"user_id"`
	ProjectID uint           `gorm:"index;not null" json:"project_id"`
	Type      string         `gorm:"size:16;not null" json:"type"`
	Status    string         `gorm:"size:16;not null;default:queued;index" json:"status"`
	Model     string         `gorm:"size:128" json:"model"`
	Input     datatypes.JSON `gorm:"type:jsonb" json:"input"`
	// Progress là tiến độ của job nhiều bước: {"current":3,"total":6,"label":"..."}.
	// Rỗng với job một bước.
	Progress datatypes.JSON `gorm:"type:jsonb" json:"progress,omitempty"`
	Error    string         `gorm:"type:text" json:"error,omitempty"`
	// UsageRecorded true khi có ít nhất một Ollama call trả đủ số liệu (kể cả
	// số đo thực bằng 0). Token chỉ cộng từ các call đã đo, không suy đoán.
	PromptTokens     int64      `gorm:"not null;default:0" json:"prompt_tokens"`
	CompletionTokens int64      `gorm:"not null;default:0" json:"completion_tokens"`
	TotalTokens      int64      `gorm:"not null;default:0" json:"total_tokens"`
	UsageRecorded    bool       `gorm:"not null;default:false;index" json:"usage_recorded"`
	CreatedAt        time.Time  `json:"created_at"`
	StartedAt        *time.Time `json:"started_at,omitempty"`
	FinishedAt       *time.Time `json:"finished_at,omitempty"`
}

type Artifact struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	JobID     uint           `gorm:"index;not null" json:"job_id"`
	ProjectID uint           `gorm:"index;not null" json:"project_id"`
	Type      string         `gorm:"size:32;not null" json:"type"`
	Title     string         `gorm:"size:512" json:"title"`
	Content   datatypes.JSON `gorm:"type:jsonb" json:"content"`
	// GoogleForm ghi lại lần xuất Google Forms gần nhất của artifact này:
	// {form_id, edit_url, responder_url, exported_at}. Rỗng nếu chưa xuất.
	GoogleForm datatypes.JSON `gorm:"type:jsonb" json:"google_form,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
}

// GoogleAccount là tài khoản Google mà MỘT giáo viên tự nối để xuất đề sang
// Google Forms. Refresh token lưu đã mã hoá (AES-GCM, khoá TOKEN_ENCRYPTION_KEY)
// và không bao giờ trả ra API — kể cả cho admin.
type GoogleAccount struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	UserID          uint      `gorm:"uniqueIndex;not null" json:"user_id"`
	GoogleEmail     string    `gorm:"size:255" json:"google_email"`
	RefreshTokenEnc string    `gorm:"type:text;not null" json:"-"`
	Scopes          string    `gorm:"type:text" json:"scopes"`
	ConnectedAt     time.Time `json:"connected_at"`
}
