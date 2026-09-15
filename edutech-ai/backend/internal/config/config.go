// Package config loads application configuration from environment variables
// with sane defaults for local development.
package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL       string
	JWTSecret         string
	OllamaURL         string
	AdminEmail        string
	AdminPassword     string
	MaxConcurrentJobs int
	DefaultModel      string
	Port              string
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Load reads configuration from the environment (see spec section 7).
func Load() *Config {
	maxJobs := 2
	if v := os.Getenv("MAX_CONCURRENT_JOBS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxJobs = n
		}
	}
	return &Config{
		DatabaseURL:       getenv("DATABASE_URL", "postgres://edutech:edutech@localhost:5432/edutech?sslmode=disable"),
		JWTSecret:         getenv("JWT_SECRET", "dev-secret-change-me"),
		OllamaURL:         getenv("OLLAMA_URL", "http://localhost:11434"),
		AdminEmail:        getenv("ADMIN_EMAIL", "admin@edutech.local"),
		AdminPassword:     getenv("ADMIN_PASSWORD", "admin12345"),
		MaxConcurrentJobs: maxJobs,
		DefaultModel:      getenv("DEFAULT_MODEL", "qwen3:8b"),
		Port:              getenv("PORT", "8080"),
	}
}
