package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"JumysTab/internal/middleware"
	"JumysTab/internal/model"
	"JumysTab/internal/service"
)

type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

// POST /api/auth/register
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req model.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.Phone == "" || req.City == "" {
		respondError(w, http.StatusBadRequest, "name, phone and city are required")
		return
	}

	link, err := h.auth.Register(r.Context(), &req)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrAlreadyExists):
			respondError(w, http.StatusConflict, "user with this name already exists")
		case errors.Is(err, service.ErrTelegramDown):
			respondError(w, http.StatusServiceUnavailable, "telegram auth is temporarily unavailable")
		default:
			log.Printf("[handler] register: %v", err)
			respondError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	respondJSON(w, http.StatusCreated, map[string]string{
		"verificationLink": link,
		"message":          "Please open the Telegram link to activate your account",
	})
}

// POST /api/auth/login/request
func (h *AuthHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Name == "" {
		respondError(w, http.StatusBadRequest, "name is required")
		return
	}

	if err := h.auth.RequestOTP(r.Context(), body.Name); err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user not found")
		case errors.Is(err, service.ErrNotActivated):
			respondError(w, http.StatusForbidden, "telegram not activated — follow the registration link")
		case errors.Is(err, service.ErrTelegramDown):
			respondError(w, http.StatusServiceUnavailable, "telegram auth is temporarily unavailable")
		default:
			log.Printf("[handler] request otp: %v", err)
			respondError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	respondJSON(w, http.StatusOK, map[string]string{
		"message": "OTP sent to your Telegram",
	})
}

// POST /api/auth/login/verify
func (h *AuthHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.Code == "" {
		respondError(w, http.StatusBadRequest, "name and code are required")
		return
	}

	resp, err := h.auth.VerifyOTP(r.Context(), req.Name, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user not found")
		case errors.Is(err, service.ErrInvalidCode):
			respondError(w, http.StatusUnauthorized, "invalid or expired code")
		default:
			log.Printf("[handler] verify otp: %v", err)
			respondError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	respondJSON(w, http.StatusOK, resp)
}

// GET /api/profile
func (h *AuthHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		respondError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.auth.GetProfile(r.Context(), userID)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user not found")
		default:
			log.Printf("[handler] get profile: %v", err)
			respondError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}

	respondJSON(w, http.StatusOK, user)
}

// GET /api/auth/status?name=...
func (h *AuthHandler) ActivationStatus(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		respondError(w, http.StatusBadRequest, "name query param required")
		return
	}

	activated, err := h.auth.IsActivated(r.Context(), name)
	if err != nil {
		if errors.Is(err, service.ErrUserNotFound) {
			respondError(w, http.StatusNotFound, "user not found")
			return
		}
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"activated": activated})
}
