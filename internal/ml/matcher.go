package ml

import (
	"context"
	"log"
	"sort"

	"JumysTab/internal/model"
)

const defaultThreshold = 0.6 // минимальный score для уведомления

// CandidateScore — результат скоринга одного кандидата
type CandidateScore struct {
	User  *model.User
	Score float64
}

// Config — настройки ML матчера (передаётся из main/service)
type Config struct {
	MLURL     string  // URL Python сервиса, "" = только локальный скоринг
	Threshold float64 // минимальный порог score
	TopN      int     // максимум уведомлений на одну вакансию
}

func (c *Config) threshold() float64 {
	if c.Threshold <= 0 {
		return defaultThreshold
	}
	return c.Threshold
}

func (c *Config) topN() int {
	if c.TopN <= 0 {
		return 10
	}
	return c.TopN
}

// RankUsers — скорит всех кандидатов под конкретный job
// Возвращает топ-N отсортированных по убыванию score
func RankUsers(ctx context.Context, users []*model.User, job *model.Job, cfg Config) []CandidateScore {
	results := make([]CandidateScore, 0, len(users))

	for _, user := range users {
		select {
		case <-ctx.Done():
			log.Printf("[ml] ranking cancelled for job %s", job.ID)
			return results
		default:
		}

		f := BuildFeatures(user, job)
		score, err := Predict(cfg.MLURL, f)
		if err != nil {
			log.Printf("[ml] score error for user %s: %v", user.ID, err)
			continue
		}

		if score >= cfg.threshold() {
			results = append(results, CandidateScore{User: user, Score: score})
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if len(results) > cfg.topN() {
		results = results[:cfg.topN()]
	}

	return results
}
