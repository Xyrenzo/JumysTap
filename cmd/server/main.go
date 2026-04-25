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
	"JumysTab/internal/migration"
	"JumysTab/internal/ml"
	"JumysTab/internal/repository"
	"JumysTab/internal/router"
	"JumysTab/internal/service"
	"JumysTab/internal/telegram"
)

type runtimeBot interface {
	BotUsername() string
	NotifyJobMatch(chatID int64, jobID, jobTitle string, score float64) error
	SendOTP(chatID int64, code string) error
	SendWelcome(chatID int64, name string) error
	StartPolling(ctx context.Context)
}

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

	if err := migration.Apply(ctx, pool); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	frontendRoot, err := router.ResolveFrontendRoot()
	if err != nil {
		log.Fatalf("frontend assets: %v", err)
	}

	// Repositories
	userRepo := repository.NewUserRepository(pool)
	otpRepo := repository.NewOTPRepository(pool)
	pendingRepo := repository.NewPendingRepository(pool)
	jobRepo := repository.NewJobRepository(pool)

	// Auth service (bot injected after)
	var authSvc *service.AuthService

	bot := buildBot(cfg, func(ctx context.Context, token string, chatID int64) error {
		return authSvc.ActivateTelegram(ctx, token, chatID)
	})

	// Wire services
	authSvc = service.NewAuthService(userRepo, otpRepo, pendingRepo, bot, cfg.JWTSecret)
	jobSvc := service.NewJobService(jobRepo, userRepo).
		WithMLConfig(ml.Config{
			MLURL:     cfg.MLUrl,
			Threshold: 0.6,
			TopN:      10,
		})

	if bot.BotUsername() != "" {
		jobSvc = jobSvc.WithNotifier(bot)
		go bot.StartPolling(ctx)
	}

	// HTTP handlers
	authHandler := handler.NewAuthHandler(authSvc)
	jobHandler := handler.NewJobHandler(jobSvc)
	httpHandler, err := router.New(authHandler, jobHandler, cfg.JWTSecret, frontendRoot)
	if err != nil {
		log.Fatalf("router: %v", err)
	}

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
		log.Printf("[server] serving frontend from %s", frontendRoot)
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

func buildBot(cfg *config.Config, onActivate telegram.OnActivate) runtimeBot {
	if cfg.TelegramToken == "" {
		log.Println("[telegram] disabled: TELEGRAM_BOT_TOKEN is not set")
		return telegram.NewDisabledBot()
	}

	bot, err := telegram.NewBot(cfg.TelegramToken, onActivate)
	if err != nil {
		log.Printf("[telegram] disabled: %v", err)
		return telegram.NewDisabledBot()
	}

	return bot
}
