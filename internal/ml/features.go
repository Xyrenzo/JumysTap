package ml

import (
	"strings"

	"JumysTab/internal/model"
)

// Jaccard — пересечение / объединение двух множеств строк
func Jaccard(a, b []string) float64 {
	if len(a) == 0 && len(b) == 0 {
		return 1.0 // оба пустые — считаем совпадением
	}

	setA := make(map[string]bool, len(a))
	for _, v := range a {
		setA[strings.ToLower(strings.TrimSpace(v))] = true
	}

	inter := 0
	union := len(setA)

	for _, v := range b {
		k := strings.ToLower(strings.TrimSpace(v))
		if setA[k] {
			inter++
		} else {
			union++
		}
	}

	if union == 0 {
		return 0
	}
	return float64(inter) / float64(union)
}

func cityMatch(a, b string) float64 {
	if strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b)) {
		return 1.0
	}
	return 0.0
}

// BuildFeatures — строит вектор признаков из пары (user, job)
func BuildFeatures(user *model.User, job *model.Job) Features {
	return Features{
		SkillMatch:        Jaccard(user.Skills, job.Skills),
		CityMatch:         cityMatch(user.City, job.City),
		AvailabilityMatch: Jaccard(user.Availability, job.Availability),
		SalaryMatch:       salaryMatch(user.ExpectedSalary, job.Salary),
	}
}

// salaryMatch — простая эвристика: если у worker нет ожиданий — нейтрально
// расширишь потом когда salary станет числом в job тоже
func salaryMatch(_ *int64, _ string) float64 {
	return 0.5
}
