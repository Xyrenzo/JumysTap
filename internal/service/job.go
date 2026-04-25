package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"

	"JumysTab/internal/ml"
	"JumysTab/internal/model"
	"JumysTab/internal/repository"

	"github.com/google/uuid"
)

var (
	ErrJobNotFound  = errors.New("job not found")
	ErrForbidden    = errors.New("forbidden")
	ErrInvalidInput = errors.New("invalid input")
	ErrRoleLocked   = errors.New("role already locked")
)

// Notifier — интерфейс для отправки уведомлений (Telegram или любой другой)
// Реализацию подключишь отдельно
type Notifier interface {
	NotifyJobMatch(chatID int64, jobID, jobTitle string, score float64) error
}

type JobService struct {
	jobs     *repository.JobRepository
	users    *repository.UserRepository
	mlCfg    ml.Config
	notifier Notifier // nil = уведомления отключены
}

func NewJobService(
	jobs *repository.JobRepository,
	users *repository.UserRepository,
) *JobService {
	return &JobService{
		jobs:  jobs,
		users: users,
		mlCfg: ml.Config{
			MLURL:     "", // "" = только локальный скоринг (без Python)
			Threshold: 0.3,
			TopN:      10,
		},
	}
}

// WithMLConfig — настройка ML (вызови в main если нужен Python сервис)
func (s *JobService) WithMLConfig(cfg ml.Config) *JobService {
	s.mlCfg = cfg
	return s
}

// WithNotifier — подключение Telegram/другого нотификатора
func (s *JobService) WithNotifier(n Notifier) *JobService {
	s.notifier = n
	return s
}

func (s *JobService) CreateJob(ctx context.Context, authorID string, req *model.CreateJobRequest) (*model.Job, error) {
	author, err := s.users.FindByID(ctx, authorID)
	if err != nil {
		if isNotFound(err) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("find author: %w", err)
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	req.JobType = strings.TrimSpace(req.JobType)
	req.WorkFormat = strings.TrimSpace(req.WorkFormat)
	req.City = strings.TrimSpace(req.City)
	req.Address = strings.TrimSpace(req.Address)
	req.Salary = strings.TrimSpace(req.Salary)
	req.ContactPhone = strings.TrimSpace(req.ContactPhone)
	req.ExperienceRequired = strings.TrimSpace(req.ExperienceRequired)
	req.Date = strings.TrimSpace(req.Date)

	if author.Role != "employer" {
		return nil, fmt.Errorf("%w: only employers can create jobs", ErrForbidden)
	}
	if req.Title == "" {
		return nil, fmt.Errorf("%w: title is required", ErrInvalidInput)
	}
	if req.JobType != "vacancy" && req.JobType != "freelance" {
		return nil, fmt.Errorf("%w: jobType must be 'vacancy' or 'freelance'", ErrInvalidInput)
	}
	if req.WorkFormat != "" && req.WorkFormat != "remote" && req.WorkFormat != "onsite" && req.WorkFormat != "hybrid" {
		return nil, fmt.Errorf("%w: workFormat must be 'remote', 'onsite' or 'hybrid'", ErrInvalidInput)
	}
	if req.City == "" {
		req.City = strings.TrimSpace(author.City)
	}
	if req.ContactPhone == "" {
		req.ContactPhone = strings.TrimSpace(author.Phone)
	}
	if req.City == "" {
		return nil, fmt.Errorf("%w: city is required", ErrInvalidInput)
	}
	if req.ContactPhone == "" {
		return nil, fmt.Errorf("%w: contactPhone is required", ErrInvalidInput)
	}
	if req.Skills == nil {
		req.Skills = []string{}
	}
	if req.Availability == nil {
		req.Availability = []string{}
	}

	job := &model.Job{
		ID:                 uuid.New().String(),
		AuthorID:           authorID,
		Title:              req.Title,
		Description:        req.Description,
		JobType:            req.JobType,
		WorkFormat:         req.WorkFormat,
		City:               req.City,
		Address:            req.Address,
		Salary:             req.Salary,
		ContactPhone:       req.ContactPhone,
		Urgent:             req.Urgent,
		Skills:             req.Skills,
		Availability:       req.Availability,
		ExperienceRequired: req.ExperienceRequired,
		EventDate:          req.Date,
		PeopleNeeded:       req.PeopleNeeded,
		ImageURL:           req.ImageURL,
		CreatedAt:          time.Now(),
	}

	if err := s.jobs.Create(ctx, job); err != nil {
		return nil, fmt.Errorf("create job: %w", err)
	}

	created, err := s.jobs.GetByID(ctx, job.ID)
	if err != nil {
		created = job
	}

	// Запускаем матчинг асинхронно — не блокируем ответ клиенту
	go s.runMatching(created)

	return created, nil
}

// runMatching — горутина, запускается после создания job
func (s *JobService) runMatching(job *model.Job) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	log.Printf("[matching] started for job %s (%s)", job.ID, job.Title)

	workers, err := s.users.GetAllWorkers(ctx)
	if err != nil {
		log.Printf("[matching] get workers error: %v", err)
		return
	}

	if len(workers) == 0 {
		log.Printf("[matching] no workers found for job %s", job.ID)
		return
	}

	ranked := ml.RankUsers(ctx, workers, job, s.mlCfg)

	log.Printf("[matching] job %s → %d candidates above threshold", job.ID, len(ranked))

	if s.notifier == nil {
		// Нотификатор не подключён — просто логируем
		for _, c := range ranked {
			log.Printf("[matching] candidate %s score=%.3f", c.User.ID, c.Score)
		}
		return
	}

	for _, c := range ranked {
		if c.User.TelegramChatID == nil {
			continue
		}
		if err := s.notifier.NotifyJobMatch(*c.User.TelegramChatID, job.ID, job.Title, c.Score); err != nil {
			log.Printf("[matching] notify error for user %s: %v", c.User.ID, err)
		}
	}
}

func (s *JobService) ListJobs(ctx context.Context, limit, offset int) ([]*model.Job, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	return s.jobs.List(ctx, limit, offset)
}

func (s *JobService) GetJob(ctx context.Context, id string) (*model.Job, error) {
	job, err := s.jobs.GetByID(ctx, id)
	if err != nil {
		if isNotFound(err) {
			return nil, ErrJobNotFound
		}
		return nil, fmt.Errorf("get job: %w", err)
	}
	return job, nil
}

func (s *JobService) MyJobs(ctx context.Context, authorID string) ([]*model.Job, error) {
	return s.jobs.ListByAuthor(ctx, authorID)
}

func (s *JobService) DeleteJob(ctx context.Context, id, authorID string) error {
	if err := s.jobs.Delete(ctx, id, authorID); err != nil {
		if isNotFound(err) {
			return ErrJobNotFound
		}
		return fmt.Errorf("delete job: %w", err)
	}
	return nil
}

func (s *JobService) UpdateProfile(ctx context.Context, userID string, req *model.UpdateProfileRequest) (*model.User, error) {
	current, err := s.users.FindByID(ctx, userID)
	if err != nil {
		if isNotFound(err) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("find user: %w", err)
	}

	req.DisplayName = strings.TrimSpace(req.DisplayName)
	req.Phone = strings.TrimSpace(req.Phone)
	req.City = strings.TrimSpace(req.City)
	req.Role = strings.TrimSpace(req.Role)
	req.Bio = strings.TrimSpace(req.Bio)
	req.AvatarURL = strings.TrimSpace(req.AvatarURL)
	req.Experience = strings.TrimSpace(req.Experience)
	req.JobType = strings.TrimSpace(req.JobType)

	if req.DisplayName == "" {
		req.DisplayName = current.DisplayName
	}
	if req.DisplayName == "" {
		req.DisplayName = current.Name
	}
	if req.DisplayName == "" {
		return nil, fmt.Errorf("%w: displayName is required", ErrInvalidInput)
	}
	if req.Phone == "" {
		req.Phone = strings.TrimSpace(current.Phone)
	}
	if req.Role == "" {
		req.Role = strings.TrimSpace(current.Role)
	}
	if req.Role != "worker" && req.Role != "employer" {
		return nil, fmt.Errorf("%w: role must be 'worker' or 'employer'", ErrInvalidInput)
	}
	if current.Role != "" && req.Role != current.Role {
		return nil, fmt.Errorf("%w: role cannot be changed after it is saved", ErrRoleLocked)
	}
	if req.Skills == nil {
		req.Skills = []string{}
	}
	if req.Availability == nil {
		req.Availability = []string{}
	}
	if req.Role == "employer" {
		req.Bio = ""
		req.Experience = ""
		req.JobType = ""
		req.ExpectedSalary = nil
		req.Skills = []string{}
		req.Availability = []string{}
	}

	if err := s.users.UpdateProfile(ctx, userID, req); err != nil {
		if isNotFound(err) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("update profile: %w", err)
	}
	return s.users.FindByID(ctx, userID)
}

func isNotFound(err error) bool {
	return err == repository.ErrNotFound
}

// подавляем unused import если sort нигде не используется
var _ = sort.Slice
