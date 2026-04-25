package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"JumysTab/internal/config"
	"JumysTab/internal/db"
	"JumysTab/internal/handler"
	"JumysTab/internal/ml"
	"JumysTab/internal/repository"
	"JumysTab/internal/router"
	"JumysTab/internal/service"
	"JumysTab/internal/telegram"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Database
	pool, err := db.NewPool(ctx, cfg.DBUrl)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	// Repositories
	userRepo := repository.NewUserRepository(pool)
	otpRepo := repository.NewOTPRepository(pool)
	pendingRepo := repository.NewPendingRepository(pool)
	jobRepo := repository.NewJobRepository(pool)

	// Auth service (bot injected after)
	var authSvc *service.AuthService

	// Telegram bot — onActivate callback wires back to the service
	bot, err := telegram.NewBot(cfg.TelegramToken, func(ctx context.Context, token string, chatID int64) error {
		return authSvc.ActivateTelegram(ctx, token, chatID)
	})
	if err != nil {
		log.Fatalf("telegram bot: %v", err)
	}

	// Wire services
	authSvc = service.NewAuthService(userRepo, otpRepo, pendingRepo, bot, cfg.JWTSecret)
	jobSvc := service.NewJobService(jobRepo, userRepo).
		WithNotifier(bot).
		WithMLConfig(ml.Config{
			MLURL:     cfg.MLUrl, // "" = локальный скоринг без Python
			Threshold: 0.6,
			TopN:      10,
		})

	// Start bot polling in background
	go bot.StartPolling(ctx)

	// HTTP handlers
	authHandler := handler.NewAuthHandler(authSvc)
	jobHandler := handler.NewJobHandler(jobSvc)
	httpHandler := router.New(authHandler, jobHandler, cfg.JWTSecret)

	srv := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      httpHandler,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("[server] listening on :%s", cfg.ServerPort)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	<-quit
	log.Println("[server] shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("[server] shutdown error: %v", err)
	}
	log.Println("[server] stopped")
}
