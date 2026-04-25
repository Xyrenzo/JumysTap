package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"JumysTab/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type JobRepository struct {
	pool *pgxpool.Pool
}

func NewJobRepository(pool *pgxpool.Pool) *JobRepository {
	return &JobRepository{pool: pool}
}

func (r *JobRepository) Create(ctx context.Context, j *model.Job) error {
	const q = `
		INSERT INTO jobs (
			id, author_id, title, description, job_type, work_format, city, address, salary,
			contact_phone, urgent, skills, availability, experience_required, event_date,
			people_needed, image_url, created_at
		)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
	`
	_, err := r.pool.Exec(ctx, q,
		j.ID, j.AuthorID, j.Title, j.Description,
		j.JobType, j.WorkFormat, j.City, j.Address, j.Salary,
		j.ContactPhone, j.Urgent, j.Skills, j.Availability, j.ExperienceRequired,
		j.EventDate, j.PeopleNeeded, j.ImageURL, j.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create job: %w", err)
	}
	return nil
}

func (r *JobRepository) GetByID(ctx context.Context, id string) (*model.Job, error) {
	const q = `
		SELECT
			j.id, j.author_id, COALESCE(u.display_name, u.name), j.title, j.description, j.job_type, j.work_format,
			j.city, j.address, j.salary, j.contact_phone, j.urgent, j.skills, j.availability,
			j.experience_required, j.event_date, j.people_needed, j.image_url, j.created_at
		FROM jobs j
		JOIN users u ON u.id = j.author_id
		WHERE j.id = $1
	`
	return r.scanOne(ctx, q, id)
}

func (r *JobRepository) List(ctx context.Context, limit, offset int) ([]*model.Job, error) {
	const q = `
		SELECT
			j.id, j.author_id, COALESCE(u.display_name, u.name), j.title, j.description, j.job_type, j.work_format,
			j.city, j.address, j.salary, j.contact_phone, j.urgent, j.skills, j.availability,
			j.experience_required, j.event_date, j.people_needed, j.image_url, j.created_at
		FROM jobs j
		JOIN users u ON u.id = j.author_id
		ORDER BY j.created_at DESC
		LIMIT $1 OFFSET $2
	`
	rows, err := r.pool.Query(ctx, q, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()

	var jobs []*model.Job
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, fmt.Errorf("scan job: %w", err)
		}
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate jobs: %w", err)
	}
	return jobs, nil
}

func (r *JobRepository) ListByAuthor(ctx context.Context, authorID string) ([]*model.Job, error) {
	const q = `
		SELECT
			j.id, j.author_id, COALESCE(u.display_name, u.name), j.title, j.description, j.job_type, j.work_format,
			j.city, j.address, j.salary, j.contact_phone, j.urgent, j.skills, j.availability,
			j.experience_required, j.event_date, j.people_needed, j.image_url, j.created_at
		FROM jobs j
		JOIN users u ON u.id = j.author_id
		WHERE j.author_id = $1
		ORDER BY j.created_at DESC
	`
	rows, err := r.pool.Query(ctx, q, authorID)
	if err != nil {
		return nil, fmt.Errorf("list jobs by author: %w", err)
	}
	defer rows.Close()

	var jobs []*model.Job
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, fmt.Errorf("scan job: %w", err)
		}
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate jobs by author: %w", err)
	}
	return jobs, nil
}

func (r *JobRepository) Delete(ctx context.Context, id, authorID string) error {
	const q = `DELETE FROM jobs WHERE id=$1 AND author_id=$2`
	tag, err := r.pool.Exec(ctx, q, id, authorID)
	if err != nil {
		return fmt.Errorf("delete job: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *JobRepository) scanOne(ctx context.Context, q string, args ...any) (*model.Job, error) {
	row := r.pool.QueryRow(ctx, q, args...)
	j, err := scanJob(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("scan job: %w", err)
	}
	return j, nil
}

type jobScanner interface {
	Scan(dest ...any) error
}

func scanJob(scanner jobScanner) (*model.Job, error) {
	j := &model.Job{}
	var (
		eventDate    sql.NullString
		peopleNeeded sql.NullInt64
	)

	err := scanner.Scan(
		&j.ID,
		&j.AuthorID,
		&j.AuthorName,
		&j.Title,
		&j.Description,
		&j.JobType,
		&j.WorkFormat,
		&j.City,
		&j.Address,
		&j.Salary,
		&j.ContactPhone,
		&j.Urgent,
		&j.Skills,
		&j.Availability,
		&j.ExperienceRequired,
		&eventDate,
		&peopleNeeded,
		&j.ImageURL,
		&j.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if eventDate.Valid {
		j.EventDate = eventDate.String
	}
	if peopleNeeded.Valid {
		value := peopleNeeded.Int64
		j.PeopleNeeded = &value
	}
	if j.Skills == nil {
		j.Skills = []string{}
	}
	if j.Availability == nil {
		j.Availability = []string{}
	}

	return j, nil
}
