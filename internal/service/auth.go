package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"JumysTab/internal/middleware"
	"JumysTab/internal/model"
	"JumysTab/internal/repository"

	"github.com/google/uuid"
)

var (
	ErrUserNotFound  = errors.New("user not found")
	ErrAlreadyExists = errors.New("user already exists")
	ErrNotActivated  = errors.New("telegram not activated — follow the link to activate")
	ErrInvalidCode   = errors.New("invalid or expired code")
	ErrTelegramDown  = errors.New("telegram integration is disabled")
)

type TelegramBot interface {
	SendOTP(chatID int64, code string) error
	SendWelcome(chatID int64, name string) error
	BotUsername() string
}

type AuthService struct {
	users     *repository.UserRepository
	otps      *repository.OTPRepository
	pending   *repository.PendingRepository
	bot       TelegramBot
	jwtSecret string
}

func NewAuthService(
	users *repository.UserRepository,
	otps *repository.OTPRepository,
	pending *repository.PendingRepository,
	bot TelegramBot,
	jwtSecret string,
) *AuthService {
	return &AuthService{
		users:     users,
		otps:      otps,
		pending:   pending,
		bot:       bot,
		jwtSecret: jwtSecret,
	}
}

// Register creates a new user and returns a Telegram deep-link for activation.
func (s *AuthService) Register(ctx context.Context, req *model.RegisterRequest) (verificationLink string, err error) {
	if !s.telegramEnabled() {
		return "", ErrTelegramDown
	}

	_, err = s.users.FindByName(ctx, req.Name)
	if err == nil {
		return "", ErrAlreadyExists
	}
	if !errors.Is(err, repository.ErrNotFound) {
		return "", fmt.Errorf("check user: %w", err)
	}

	user := &model.User{
		ID:           uuid.New().String(),
		Name:         req.Name,
		DisplayName:  req.Name,
		Phone:        req.Phone,
		City:         req.City,
		Skills:       []string{},
		Availability: []string{},
		Rating:       0,
		TGVerified:   false,
		CreatedAt:    time.Now(),
	}

	if err := s.users.Create(ctx, user); err != nil {
		if errors.Is(err, repository.ErrAlreadyExists) {
			return "", ErrAlreadyExists
		}
		return "", fmt.Errorf("create user: %w", err)
	}

	token := uuid.New().String()
	if err := s.pending.Save(ctx, user.ID, token); err != nil {
		return "", fmt.Errorf("save pending: %w", err)
	}

	link := fmt.Sprintf("https://t.me/%s?start=%s", s.bot.BotUsername(), token)
	return link, nil
}

// RequestOTP sends an OTP via Telegram if the user has activated the bot.
func (s *AuthService) RequestOTP(ctx context.Context, name string) error {
	if !s.telegramEnabled() {
		return ErrTelegramDown
	}

	user, err := s.users.FindByName(ctx, name)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return ErrUserNotFound
		}
		return fmt.Errorf("find user: %w", err)
	}

	if !user.TGVerified || user.TelegramChatID == nil {
		return ErrNotActivated
	}

	code, err := generateOTP(6)
	if err != nil {
		return fmt.Errorf("generate otp: %w", err)
	}

	if err := s.otps.Save(ctx, user.ID, code, time.Now().Add(5*time.Minute)); err != nil {
		return fmt.Errorf("save otp: %w", err)
	}

	if err := s.bot.SendOTP(*user.TelegramChatID, code); err != nil {
		return fmt.Errorf("send otp: %w", err)
	}

	return nil
}

// VerifyOTP checks the OTP and returns a JWT token.
func (s *AuthService) VerifyOTP(ctx context.Context, name, code string) (*model.TokenResponse, error) {
	user, err := s.users.FindByName(ctx, name)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("find user: %w", err)
	}

	ok, err := s.otps.Verify(ctx, user.ID, code)
	if err != nil {
		return nil, fmt.Errorf("verify otp: %w", err)
	}
	if !ok {
		return nil, ErrInvalidCode
	}

	token, err := middleware.GenerateToken(user.ID, s.jwtSecret)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	return &model.TokenResponse{Token: token, User: user}, nil
}

// ActivateTelegram is called by the bot when user sends /start <token>.
func (s *AuthService) ActivateTelegram(ctx context.Context, token string, chatID int64) error {
	if !s.telegramEnabled() {
		return ErrTelegramDown
	}

	userID, err := s.pending.FindByToken(ctx, token)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return fmt.Errorf("token not found")
		}
		return fmt.Errorf("find pending: %w", err)
	}

	if err := s.users.SetTelegramVerified(ctx, userID, chatID); err != nil {
		return fmt.Errorf("set verified: %w", err)
	}

	if err := s.pending.Delete(ctx, userID); err != nil {
		return fmt.Errorf("delete pending: %w", err)
	}

	user, err := s.users.FindByID(ctx, userID)
	if err == nil {
		_ = s.bot.SendWelcome(chatID, user.Name)
	}

	return nil
}

// IsActivated returns true if user exists and has activated Telegram.
func (s *AuthService) IsActivated(ctx context.Context, name string) (bool, error) {
	user, err := s.users.FindByName(ctx, name)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return false, ErrUserNotFound
		}
		return false, fmt.Errorf("find user: %w", err)
	}
	return user.TGVerified, nil
}

// GetProfile returns user profile by ID.
func (s *AuthService) GetProfile(ctx context.Context, userID string) (*model.User, error) {
	user, err := s.users.GetProfile(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("get profile: %w", err)
	}
	return user, nil
}

func generateOTP(digits int) (string, error) {
	max := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(digits)), nil)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%0*d", digits, n), nil
}

func (s *AuthService) telegramEnabled() bool {
	return s.bot != nil && strings.TrimSpace(s.bot.BotUsername()) != ""
}
