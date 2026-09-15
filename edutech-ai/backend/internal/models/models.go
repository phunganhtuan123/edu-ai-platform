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
	JobTypeQuiz     = "quiz"
	JobTypeExam     = "exam"
	JobTypeWriting  = "writing"
	JobTypeActivity = "activity"
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
	ID         uint           `gorm:"primaryKey" json:"id"`
	UserID     uint           `gorm:"index;not null" json:"user_id"`
	ProjectID  uint           `gorm:"index;not null" json:"project_id"`
	Type       string         `gorm:"size:16;not null" json:"type"`
	Status     string         `gorm:"size:16;not null;default:queued;index" json:"status"`
	Model      string         `gorm:"size:128" json:"model"`
	Input      datatypes.JSON `gorm:"type:jsonb" json:"input"`
	Error      string         `gorm:"type:text" json:"error,omitempty"`
	CreatedAt  time.Time      `json:"created_at"`
	StartedAt  *time.Time     `json:"started_at,omitempty"`
	FinishedAt *time.Time     `json:"finished_at,omitempty"`
}

type Artifact struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	JobID     uint           `gorm:"index;not null" json:"job_id"`
	ProjectID uint           `gorm:"index;not null" json:"project_id"`
	Type      string         `gorm:"size:16;not null" json:"type"`
	Title     string         `gorm:"size:512" json:"title"`
	Content   datatypes.JSON `gorm:"type:jsonb" json:"content"`
	CreatedAt time.Time      `json:"created_at"`
}
