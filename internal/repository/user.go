package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"JumysTab/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")
var ErrAlreadyExists = errors.New("already exists")

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (r *UserRepository) Create(ctx context.Context, u *model.User) error {
	displayName := u.DisplayName
	if displayName == "" {
		displayName = u.Name
	}

	skills := u.Skills
	if skills == nil {
		skills = []string{}
	}

	availability := u.Availability
	if availability == nil {
		availability = []string{}
	}

	const q = `
		INSERT INTO users (
			id, name, display_name, phone, city, role, bio, avatar_url, experience,
			job_type, expected_salary, skills, availability_list, telegram_chat_id, rating, tg_verified, created_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
	`

	_, err := r.pool.Exec(ctx, q,
		u.ID,
		u.Name,
		displayName,
		u.Phone,
		u.City,
		u.Role,
		u.Bio,
		u.AvatarURL,
		u.Experience,
		u.JobType,
		u.ExpectedSalary,
		skills,
		availability,
		u.TelegramChatID,
		u.Rating,
		u.TGVerified,
		u.CreatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return ErrAlreadyExists
		}
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*model.User, error) {
	const q = `
		SELECT
			id, name, display_name, phone, city, role, bio, avatar_url, experience,
			job_type, expected_salary, skills, availability_list, telegram_chat_id, rating, tg_verified, created_at
		FROM users
		WHERE id = $1
	`
	return r.scanOne(ctx, q, id)
}

func (r *UserRepository) FindByName(ctx context.Context, name string) (*model.User, error) {
	const q = `
		SELECT
			id, name, display_name, phone, city, role, bio, avatar_url, experience,
			job_type, expected_salary, skills, availability_list, telegram_chat_id, rating, tg_verified, created_at
		FROM users
		WHERE LOWER(name) = LOWER($1)
	`
	return r.scanOne(ctx, q, name)
}

func (r *UserRepository) FindByTelegramToken(ctx context.Context, token string) (*model.User, error) {
	const q = `
		SELECT
			u.id, u.name, u.display_name, u.phone, u.city, u.role, u.bio, u.avatar_url, u.experience,
			u.job_type, u.expected_salary, u.skills, u.availability_list, u.telegram_chat_id, u.rating, u.tg_verified, u.created_at
		FROM users u
		JOIN pending_registrations pr ON pr.user_id = u.id
		WHERE pr.token = $1
	`
	return r.scanOne(ctx, q, token)
}

func (r *UserRepository) SetTelegramVerified(ctx context.Context, userID string, chatID int64) error {
	const q = `UPDATE users SET telegram_chat_id = $1, tg_verified = true WHERE id = $2`
	_, err := r.pool.Exec(ctx, q, chatID, userID)
	if err != nil {
		return fmt.Errorf("set tg verified: %w", err)
	}
	return nil
}

func (r *UserRepository) GetProfile(ctx context.Context, userID string) (*model.User, error) {
	return r.FindByID(ctx, userID)
}

func (r *UserRepository) UpdateProfile(ctx context.Context, userID string, req *model.UpdateProfileRequest) error {
	const q = `
	UPDATE users SET
			display_name      = $2,
			phone             = $3,
			city              = $4,
			role              = $5,
			bio               = $6,
			avatar_url        = $7,
			experience        = $8,
			job_type          = $9,
			expected_salary   = $10,
			skills            = $11,
			availability_list = $12
		WHERE id = $1
	`

	skills := req.Skills
	if skills == nil {
		skills = []string{}
	}
	availability := req.Availability
	if availability == nil {
		availability = []string{}
	}

	var expectedSalary any
	if req.ExpectedSalary != nil {
		expectedSalary = *req.ExpectedSalary
	} else {
		expectedSalary = nil
	}

	tag, err := r.pool.Exec(ctx, q,
		userID,
		req.DisplayName,
		req.Phone,
		req.City,
		req.Role,
		req.Bio,
		req.AvatarURL,
		req.Experience,
		req.JobType,
		expectedSalary,
		skills,
		availability,
	)
	if err != nil {
		return fmt.Errorf("update profile: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *UserRepository) GetAllWorkers(ctx context.Context) ([]*model.User, error) {
	const q = `
		SELECT
			id, name, display_name, phone, city, role, bio, avatar_url, experience,
			job_type, expected_salary, skills, availability_list, telegram_chat_id, rating, tg_verified, created_at
		FROM users
		WHERE role = 'worker'
		  AND tg_verified = true
		  AND telegram_chat_id IS NOT NULL
	`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("get all workers: %w", err)
	}
	defer rows.Close()

	var users []*model.User
	for rows.Next() {
		u, err := r.scanRow(rows)
		if err != nil {
			return nil, fmt.Errorf("scan worker: %w", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate workers: %w", err)
	}
	return users, nil
}

func (r *UserRepository) scanOne(ctx context.Context, q string, args ...any) (*model.User, error) {
	row := r.pool.QueryRow(ctx, q, args...)

	var (
		u              model.User
		expectedSalary sql.NullInt64
		telegramChatID sql.NullInt64
		createdAt      time.Time
	)

	err := row.Scan(
		&u.ID,
		&u.Name,
		&u.DisplayName,
		&u.Phone,
		&u.City,
		&u.Role,
		&u.Bio,
		&u.AvatarURL,
		&u.Experience,
		&u.JobType,
		&expectedSalary,
		&u.Skills,
		&u.Availability,
		&telegramChatID,
		&u.Rating,
		&u.TGVerified,
		&createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("scan user: %w", err)
	}

	if u.DisplayName == "" {
		u.DisplayName = u.Name
	}
	if expectedSalary.Valid {
		value := expectedSalary.Int64
		u.ExpectedSalary = &value
	}
	if telegramChatID.Valid {
		value := telegramChatID.Int64
		u.TelegramChatID = &value
	}
	u.CreatedAt = createdAt

	return &u, nil
}

func (r *UserRepository) scanRow(rows interface{ Scan(...any) error }) (*model.User, error) {
	var (
		u              model.User
		expectedSalary sql.NullInt64
		telegramChatID sql.NullInt64
		createdAt      time.Time
	)

	err := rows.Scan(
		&u.ID,
		&u.Name,
		&u.DisplayName,
		&u.Phone,
		&u.City,
		&u.Role,
		&u.Bio,
		&u.AvatarURL,
		&u.Experience,
		&u.JobType,
		&expectedSalary,
		&u.Skills,
		&u.Availability,
		&telegramChatID,
		&u.Rating,
		&u.TGVerified,
		&createdAt,
	)
	if err != nil {
		return nil, err
	}

	if u.DisplayName == "" {
		u.DisplayName = u.Name
	}
	if expectedSalary.Valid {
		v := expectedSalary.Int64
		u.ExpectedSalary = &v
	}
	if telegramChatID.Valid {
		v := telegramChatID.Int64
		u.TelegramChatID = &v
	}
	u.CreatedAt = createdAt

	return &u, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && containsCode(err, "23505")
}

func containsCode(err error, code string) bool {
	type pgErr interface{ SQLState() string }
	if e, ok := err.(pgErr); ok {
		return e.SQLState() == code
	}
	return false
}
