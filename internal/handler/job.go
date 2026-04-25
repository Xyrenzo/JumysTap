package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"

	"JumysTab/internal/middleware"
	"JumysTab/internal/model"
	"JumysTab/internal/service"
)

type JobHandler struct {
	svc *service.JobService
}

func NewJobHandler(svc *service.JobService) *JobHandler {
	return &JobHandler{svc: svc}
}

// POST /api/jobs
func (h *JobHandler) CreateJob(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req model.CreateJobRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	job, err := h.svc.CreateJob(r.Context(), userID, &req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrForbidden):
			respondError(w, http.StatusForbidden, err.Error())
			return
		case errors.Is(err, service.ErrInvalidInput):
			respondError(w, http.StatusBadRequest, err.Error())
			return
		case errors.Is(err, service.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user not found")
			return
		}
		log.Printf("[handler] create job: %v", err)
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusCreated, job)
}

// GET /api/jobs?limit=20&offset=0
func (h *JobHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	jobs, err := h.svc.ListJobs(r.Context(), limit, offset)
	if err != nil {
		log.Printf("[handler] list jobs: %v", err)
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if jobs == nil {
		jobs = []*model.Job{}
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"jobs":   jobs,
		"offset": offset,
		"limit":  limit,
	})
}

// GET /api/jobs/{id}
func (h *JobHandler) GetJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "job id required")
		return
	}

	job, err := h.svc.GetJob(r.Context(), id)
	if err != nil {
		if errors.Is(err, service.ErrJobNotFound) {
			respondError(w, http.StatusNotFound, "job not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, job)
}

// GET /api/jobs/my
func (h *JobHandler) MyJobs(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	jobs, err := h.svc.MyJobs(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if jobs == nil {
		jobs = []*model.Job{}
	}

	respondJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
}

// DELETE /api/jobs/{id}  (protected)
func (h *JobHandler) DeleteJob(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "job id required")
		return
	}

	if err := h.svc.DeleteJob(r.Context(), id, userID); err != nil {
		if errors.Is(err, service.ErrJobNotFound) {
			respondError(w, http.StatusNotFound, "job not found or not yours")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// PUT /api/profile
func (h *JobHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req model.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.svc.UpdateProfile(r.Context(), userID, &req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user not found")
			return
		case errors.Is(err, service.ErrInvalidInput):
			respondError(w, http.StatusBadRequest, err.Error())
			return
		case errors.Is(err, service.ErrRoleLocked):
			respondError(w, http.StatusConflict, err.Error())
			return
		}
		log.Printf("[handler] update profile: %v", err)
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, user)
}
