package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type OTPRepository struct {
	pool *pgxpool.Pool
}

func NewOTPRepository(pool *pgxpool.Pool) *OTPRepository {
	return &OTPRepository{pool: pool}
}

func (r *OTPRepository) Save(ctx context.Context, userID, code string, expiresAt time.Time) error {
	const q = `
		INSERT INTO otp_codes (user_id, code, expires_at)
		VALUES ($1,$2,$3)
		ON CONFLICT (user_id) DO UPDATE SET code=$2, expires_at=$3
	`
	_, err := r.pool.Exec(ctx, q, userID, code, expiresAt)
	if err != nil {
		return fmt.Errorf("save otp: %w", err)
	}
	return nil
}

func (r *OTPRepository) Verify(ctx context.Context, userID, code string) (bool, error) {
	const q = `
		DELETE FROM otp_codes
		WHERE user_id=$1 AND code=$2 AND expires_at > NOW()
		RETURNING user_id
	`
	var id string
	err := r.pool.QueryRow(ctx, q, userID, code).Scan(&id)
	if err != nil {
		return false, nil
	}
	return true, nil
}

type PendingRepository struct {
	pool *pgxpool.Pool
}

func NewPendingRepository(pool *pgxpool.Pool) *PendingRepository {
	return &PendingRepository{pool: pool}
}

func (r *PendingRepository) Save(ctx context.Context, userID, token string) error {
	const q = `
		INSERT INTO pending_registrations (user_id, token, created_at)
		VALUES ($1,$2,NOW())
		ON CONFLICT (user_id) DO UPDATE SET token=$2, created_at=NOW()
	`
	_, err := r.pool.Exec(ctx, q, userID, token)
	if err != nil {
		return fmt.Errorf("save pending: %w", err)
	}
	return nil
}

func (r *PendingRepository) FindByToken(ctx context.Context, token string) (string, error) {
	const q = `SELECT user_id FROM pending_registrations WHERE token=$1`
	var userID string
	err := r.pool.QueryRow(ctx, q, token).Scan(&userID)
	if err != nil {
		return "", ErrNotFound
	}
	return userID, nil
}

func (r *PendingRepository) Delete(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM pending_registrations WHERE user_id=$1`, userID)
	return err
}
