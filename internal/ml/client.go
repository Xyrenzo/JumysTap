package ml

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Features — входной вектор для ML модели
type Features struct {
	SkillMatch        float64 `json:"skill_match"`
	CityMatch         float64 `json:"city_match"`
	AvailabilityMatch float64 `json:"availability_match"`
	SalaryMatch       float64 `json:"salary_match"`
}

type mlResponse struct {
	Score float64 `json:"score"`
}

var httpClient = &http.Client{Timeout: 3 * time.Second}

// Predict — отправляет фичи в Python ML сервис, возвращает score [0..1]
// Если ML недоступен — fallback на локальный скоринг
func Predict(mlURL string, f Features) (float64, error) {
	body, err := json.Marshal(f)
	if err != nil {
		return 0, fmt.Errorf("marshal features: %w", err)
	}

	resp, err := httpClient.Post(mlURL+"/predict", "application/json", bytes.NewBuffer(body))
	if err != nil {
		// ML сервис недоступен — используем локальный fallback
		return localScore(f), nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return localScore(f), nil
	}

	var result mlResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return localScore(f), nil
	}

	return result.Score, nil
}

// localScore — работает без Python, взвешенная сумма фич
// Используется как fallback или на этапе разработки
func localScore(f Features) float64 {
	return f.SkillMatch*0.5 +
		f.CityMatch*0.25 +
		f.AvailabilityMatch*0.15 +
		f.SalaryMatch*0.10
}	
