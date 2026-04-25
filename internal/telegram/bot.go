package telegram

import (
	"context"
	"fmt"
	"log"
	"strings"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
)

type OnActivate func(ctx context.Context, token string, chatID int64) error

type Bot struct {
	api        *tgbotapi.BotAPI
	onActivate OnActivate
}

func NewBot(token string, onActivate OnActivate) (*Bot, error) {
	api, err := tgbotapi.NewBotAPI(token)
	if err != nil {
		return nil, fmt.Errorf("init telegram bot: %w", err)
	}

	log.Printf("[TG] authorized as @%s", api.Self.UserName)

	return &Bot{
		api:        api,
		onActivate: onActivate,
	}, nil
}

func (b *Bot) BotUsername() string {
	return b.api.Self.UserName
}

func (b *Bot) SendOTP(chatID int64, code string) error {
	text := fmt.Sprintf(
		"🔐 Ваш код для входа в JumysTap:\n\n`%s`\n\nКод действителен 5 минут.",
		code,
	)

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = "Markdown"

	_, err := b.api.Send(msg)
	if err != nil {
		return fmt.Errorf("send otp: %w", err)
	}

	return nil
}

func (b *Bot) SendWelcome(chatID int64, name string) error {
	text := fmt.Sprintf(
		"✅ Аккаунт активирован!\n\nДобро пожаловать, *%s*!\nТеперь вы можете войти на сайт JumysTap.",
		name,
	)

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ParseMode = "Markdown"

	_, err := b.api.Send(msg)
	return err
}

func (b *Bot) SendJobMatch(chatID int64, jobTitle string, jobID string, score float64) error {
	text := fmt.Sprintf(
		"🔥 Новая подходящая вакансия!\n\n"+
			"📌 %s\n"+
			"📊 Совпадение: %.0f%%",
		jobTitle,
		score*100,
	)

	msg := tgbotapi.NewMessage(chatID, text)
	msg.ReplyMarkup = tgbotapi.InlineKeyboardMarkup{
		InlineKeyboard: [][]tgbotapi.InlineKeyboardButton{
			{
				tgbotapi.NewInlineKeyboardButtonURL(
					"👀 Посмотреть вакансию",
					fmt.Sprintf("https://jumystap.onrender.com/api/jobs/%s", jobID),
				),
			},
		},
	}

	_, err := b.api.Send(msg)
	if err != nil {
		return fmt.Errorf("send job match: %w", err)
	}
	return nil
}

func (b *Bot) NotifyJobMatch(chatID int64, jobID, jobTitle string, score float64) error {
	return b.SendJobMatch(chatID, jobTitle, jobID, score)
}


func (b *Bot) StartPolling(ctx context.Context) {
	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60

	updates := b.api.GetUpdatesChan(u)

	for {
		select {
		case <-ctx.Done():
			b.api.StopReceivingUpdates()
			return

		case update, ok := <-updates:
			if !ok {
				return
			}

			if update.Message == nil {
				continue
			}

			go b.handleMessage(ctx, update.Message)
		}
	}
}

func (b *Bot) handleMessage(ctx context.Context, msg *tgbotapi.Message) {
	text := strings.TrimSpace(msg.Text)
	chatID := msg.Chat.ID

	if strings.HasPrefix(text, "/start ") {
		token := strings.TrimSpace(strings.TrimPrefix(text, "/start "))

		if token == "" {
			b.reply(chatID, "❌ Токен не найден. Используйте ссылку с сайта.")
			return
		}

		if err := b.onActivate(ctx, token, chatID); err != nil {
			log.Printf("[TG] activate error: %v", err)
			b.reply(chatID, "❌ Ссылка недействительна или уже использована.")
			return
		}

		return
	}

	if text == "/start" {
		b.reply(chatID, "👋 Привет! JumysTap бот.\n\nАктивируйте аккаунт через <a href=\"https://jumystap.onrender.com/\">сайт.</a>")
		return
	}

	b.reply(chatID, "ℹ️ Используйте ссылку с сайта для активации. ")
}

func (b *Bot) reply(chatID int64, text string) {
	msg := tgbotapi.NewMessage(chatID, text)

	if _, err := b.api.Send(msg); err != nil {
		log.Printf("[TG] reply error: %v", err)
	}
}
