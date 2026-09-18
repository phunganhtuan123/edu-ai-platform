// EduTech AI backend server: config from env, GORM auto-migration, admin
// seeding, in-process worker pool and the Gin REST API on :8080.
package main

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/ai-for-edu/edutech-ai/backend/internal/auth"
	"github.com/ai-for-edu/edutech-ai/backend/internal/config"
	"github.com/ai-for-edu/edutech-ai/backend/internal/handlers"
	"github.com/ai-for-edu/edutech-ai/backend/internal/models"
	"github.com/ai-for-edu/edutech-ai/backend/internal/ollama"
	"github.com/ai-for-edu/edutech-ai/backend/internal/worker"
)

func main() {
	cfg := config.Load()

	db := connectDB(cfg.DatabaseURL)
	if err := db.AutoMigrate(&models.User{}, &models.Project{}, &models.Job{}, &models.Artifact{}, &models.MindmapAttachment{}, &models.GoogleAccount{}); err != nil {
		log.Fatalf("auto-migrate thất bại: %v", err)
	}
	seedAdmin(db, cfg)

	client := ollama.New(cfg.OllamaURL)
	pool := worker.New(db, client, cfg.MaxConcurrentJobs)
	pool.Start()

	h := handlers.New(db, cfg, client, pool)
	r := gin.Default()
	r.Use(corsMiddleware())

	api := r.Group("/api")
	{
		api.POST("/auth/register", h.Register)
		api.POST("/auth/login", h.Login)
		api.GET("/meta/catalog", h.Catalog)
		api.GET("/meta/exam-parts", h.ExamParts)
		api.GET("/meta/mindmap", h.MindmapMeta)

		// Callback của Google là ĐƯỜNG CÔNG KHAI: trình duyệt quay về đây
		// không mang JWT, danh tính nằm trong `state` đã ký HMAC.
		api.GET("/google/callback", h.GoogleCallback)

		authed := api.Group("")
		authed.Use(auth.Middleware(db, cfg.JWTSecret))
		{
			authed.GET("/me", h.Me)
			authed.GET("/ai/models", h.ListModels)

			authed.GET("/projects", h.ListProjects)
			authed.POST("/projects", h.CreateProject)
			authed.GET("/projects/:id", h.GetProject)
			authed.DELETE("/projects/:id", h.DeleteProject)
			authed.GET("/projects/:id/artifacts", h.ListProjectArtifacts)
			authed.POST("/projects/:id/jobs", h.CreateJob)
			authed.GET("/jobs/:id", h.GetJob)

			authed.GET("/google/status", h.GoogleStatus)
			authed.GET("/google/auth-url", h.GoogleAuthURL)
			authed.DELETE("/google/account", h.GoogleDisconnect)
			authed.POST("/artifacts/:id/export/google-forms", h.ExportGoogleForms)
			authed.PUT("/artifacts/:id/mindmap", h.SaveMindmap)
			authed.GET("/artifacts/:id/mindmap/attachments", h.ListMindmapAttachments)
			authed.POST("/artifacts/:id/mindmap/attachments", h.UploadMindmapAttachment)
			authed.GET("/artifacts/:id/mindmap/attachments/:attachmentId", h.DownloadMindmapAttachment)
			authed.DELETE("/artifacts/:id/mindmap/attachments/:attachmentId", h.DeleteMindmapAttachment)

			admin := authed.Group("/admin")
			admin.Use(auth.AdminOnly())
			{
				admin.GET("/users", h.AdminListUsers)
				admin.GET("/usage", h.AdminUsage)
				admin.PATCH("/users/:id", h.AdminPatchUser)
				admin.DELETE("/users/:id", h.AdminDeleteUser)
			}
		}
	}

	addr := ":" + cfg.Port
	log.Printf("EduTech AI backend chạy tại %s (Ollama: %s, model mặc định: %s, %d worker)",
		addr, cfg.OllamaURL, cfg.DefaultModel, cfg.MaxConcurrentJobs)
	if err := r.Run(addr); err != nil {
		log.Fatalf("server dừng: %v", err)
	}
}

// connectDB opens Postgres with retries so `docker compose up` works even
// when the database container is still starting.
func connectDB(dsn string) *gorm.DB {
	var db *gorm.DB
	var err error
	for attempt := 1; attempt <= 15; attempt++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			return db
		}
		log.Printf("chưa kết nối được database (lần %d/15): %v — thử lại sau 2s", attempt, err)
		time.Sleep(2 * time.Second)
	}
	log.Fatalf("không kết nối được database: %v", err)
	return nil
}

// seedAdmin creates the fixed admin account from ADMIN_EMAIL/ADMIN_PASSWORD
// on first run (role=admin, status=active). Existing accounts are untouched.
func seedAdmin(db *gorm.DB, cfg *config.Config) {
	if cfg.AdminEmail == "" || cfg.AdminPassword == "" {
		log.Println("bỏ qua seed admin: thiếu ADMIN_EMAIL/ADMIN_PASSWORD")
		return
	}
	var existing models.User
	if err := db.Where("email = ?", cfg.AdminEmail).First(&existing).Error; err == nil {
		return // already seeded
	}
	hash, err := auth.HashPassword(cfg.AdminPassword)
	if err != nil {
		log.Fatalf("không hash được mật khẩu admin: %v", err)
	}
	admin := models.User{
		Email:        cfg.AdminEmail,
		PasswordHash: hash,
		Name:         "Admin",
		Role:         models.RoleAdmin,
		Status:       models.StatusActive,
	}
	if err := db.Create(&admin).Error; err != nil {
		log.Fatalf("không seed được tài khoản admin: %v", err)
	}
	log.Printf("đã seed tài khoản admin: %s", cfg.AdminEmail)
}

// corsMiddleware allows all origins (MVP; nginx/HTTPS is out of scope).
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
