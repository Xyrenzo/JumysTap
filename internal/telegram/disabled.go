package telegram

import (
	"context"
	"errors"
)

var ErrDisabled = errors.New("telegram bot is disabled")

type DisabledBot struct{}

func NewDisabledBot() *DisabledBot {
	return &DisabledBot{}
}

func (b *DisabledBot) BotUsername() string {
	return ""
}

func (b *DisabledBot) NotifyJobMatch(chatID int64, jobID, jobTitle string, score float64) error {
	return ErrDisabled
}

func (b *DisabledBot) SendOTP(chatID int64, code string) error {
	return ErrDisabled
}

func (b *DisabledBot) SendWelcome(chatID int64, name string) error {
	return ErrDisabled
}

func (b *DisabledBot) StartPolling(ctx context.Context) {}
