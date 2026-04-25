package model

import "time"

type User struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	DisplayName    string    `json:"displayName"`
	Phone          string    `json:"phone"`
	City           string    `json:"city"`
	Role           string    `json:"role"`
	Bio            string    `json:"bio"`
	AvatarURL      string    `json:"avatar"`
	Experience     string    `json:"experience"`
	JobType        string    `json:"jobType"`
	ExpectedSalary *int64    `json:"expectedSalary,omitempty"`
	Skills         []string  `json:"skills"`
	Availability   []string  `json:"availability"`
	TelegramChatID *int64    `json:"telegramChatId,omitempty"`
	Rating         float64   `json:"rating"`
	TGVerified     bool      `json:"tgVerified"`
	CreatedAt      time.Time `json:"createdAt"`
}

// RegisterRequest — payload from client on registration
type RegisterRequest struct {
	Name  string `json:"name"`
	Phone string `json:"phone"`
	City  string `json:"city"`
}

// LoginRequest — login by username (name) + OTP
type LoginRequest struct {
	Name string `json:"name"`
	Code string `json:"code,omitempty"`
}

// OTPStore — used internally (stored in memory or DB)
type OTPRecord struct {
	UserID    string
	Code      string
	ExpiresAt time.Time
}

type TokenResponse struct {
	Token string `json:"token"`
	User  *User  `json:"user"`
}
