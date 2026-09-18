package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
)

func adminTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("mở sqlite test: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Job{}); err != nil {
		t.Fatalf("migrate sqlite test: %v", err)
	}
	return db
}

func TestAdminUsageFiltersPaginatesAndSummarizesRecordedTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := adminTestDB(t)
	users := []models.User{
		{ID: 1, Email: "one@example.test", Name: "Một", Role: models.RoleTeacher, Status: models.StatusActive},
		{ID: 2, Email: "two@example.test", Name: "Hai", Role: models.RoleTeacher, Status: models.StatusActive},
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatalf("seed users: %v", err)
	}
	now := time.Now()
	jobs := []models.Job{
		{ID: 1, UserID: 1, ProjectID: 11, Type: models.JobTypeLessonPlan, Status: models.JobDone, Model: "m", PromptTokens: 12, CompletionTokens: 8, TotalTokens: 20, UsageRecorded: true, CreatedAt: now.Add(-time.Minute)},
		{ID: 2, UserID: 1, ProjectID: 11, Type: models.JobTypeQuiz, Status: models.JobFailed, Model: "m", PromptTokens: 999, CompletionTokens: 999, TotalTokens: 1998, UsageRecorded: false, CreatedAt: now},
		{ID: 3, UserID: 2, ProjectID: 22, Type: models.JobTypeLessonPlan, Status: models.JobDone, Model: "m", PromptTokens: 100, CompletionTokens: 50, TotalTokens: 150, UsageRecorded: true, CreatedAt: now},
	}
	if err := db.Create(&jobs).Error; err != nil {
		t.Fatalf("seed jobs: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/admin/usage?user_id=1&page=1&page_size=1", nil)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req
	(&Handler{DB: db}).AdminUsage(c)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", rec.Code, rec.Body.String())
	}
	var body struct {
		Items    []map[string]any `json:"items"`
		Total    int64            `json:"total"`
		Page     int              `json:"page"`
		PageSize int              `json:"page_size"`
		Summary  struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
			TotalTokens      int64 `json:"total_tokens"`
			JobCount         int64 `json:"job_count"`
			RecordedJobCount int64 `json:"recorded_job_count"`
		} `json:"summary"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Items) != 1 || body.Total != 2 || body.Page != 1 || body.PageSize != 1 {
		t.Fatalf("pagination sai: %+v", body)
	}
	if body.Summary.PromptTokens != 12 || body.Summary.CompletionTokens != 8 || body.Summary.TotalTokens != 20 || body.Summary.JobCount != 2 || body.Summary.RecordedJobCount != 1 {
		t.Fatalf("summary sai hoặc đã bịa token job cũ: %+v", body.Summary)
	}
	if body.Items[0]["usage_recorded"] != false {
		t.Fatalf("job cũ mới nhất phải hiện chưa ghi nhận: %#v", body.Items[0])
	}
}

func TestAdminListUsersIncludesLifetimeTokenAggregates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := adminTestDB(t)
	user := models.User{ID: 1, Email: "one@example.test", Name: "Một", Role: models.RoleTeacher, Status: models.StatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	jobs := []models.Job{
		{UserID: 1, ProjectID: 1, Type: models.JobTypeLessonPlan, Status: models.JobDone, PromptTokens: 5, CompletionTokens: 3, TotalTokens: 8, UsageRecorded: true},
		{UserID: 1, ProjectID: 1, Type: models.JobTypeQuiz, Status: models.JobDone, UsageRecorded: false},
	}
	if err := db.Create(&jobs).Error; err != nil {
		t.Fatalf("seed jobs: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req
	(&Handler{DB: db}).AdminListUsers(c)

	var body struct {
		Users []struct {
			PromptTokens      int64 `json:"prompt_tokens"`
			CompletionTokens  int64 `json:"completion_tokens"`
			TotalTokens       int64 `json:"total_tokens"`
			UsageRecordedJobs int64 `json:"usage_recorded_jobs"`
		} `json:"users"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(body.Users) != 1 || body.Users[0].PromptTokens != 5 || body.Users[0].CompletionTokens != 3 || body.Users[0].TotalTokens != 8 || body.Users[0].UsageRecordedJobs != 1 {
		t.Fatalf("aggregate user sai: %+v", body.Users)
	}
}

func TestAdminUsageRejectsPageThatWouldOverflowOffset(t *testing.T) {
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest(http.MethodGet, "/api/admin/usage?page=1000001&page_size=100", nil)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = req
	(&Handler{}).AdminUsage(c)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("page quá lớn phải trả 400, có %d", rec.Code)
	}
}
