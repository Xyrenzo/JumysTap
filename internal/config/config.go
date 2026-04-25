package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBUrl         string
	JWTSecret     string
	TelegramToken string
	ServerPort    string
	BaseURL       string
	MLUrl         string // URL Python ML сервиса, "" = локальный скоринг
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		DBUrl:         os.Getenv("DB_URL"),
		JWTSecret:     os.Getenv("JWT_SECRET"),
		TelegramToken: os.Getenv("TELEGRAM_BOT_TOKEN"),
		ServerPort:    os.Getenv("SERVER_PORT"),
		BaseURL:       os.Getenv("BASE_URL"),
		MLUrl:         os.Getenv("ML_URL"), // необязательный
	}

	if cfg.DBUrl == "" {
		return nil, fmt.Errorf("DB_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET is required")
	}
	if cfg.TelegramToken == "" {
		return nil, fmt.Errorf("TELEGRAM_BOT_TOKEN is required")
	}
	if cfg.ServerPort == "" {
		cfg.ServerPort = "8080"
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://localhost:" + cfg.ServerPort
	}

	return cfg, nil
}
