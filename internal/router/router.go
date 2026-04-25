package router

import (
	"net/http"

	"JumysTab/internal/handler"
	"JumysTab/internal/middleware"
)

func New(auth *handler.AuthHandler, jobs *handler.JobHandler, jwtSecret string) http.Handler {
	mux := http.NewServeMux()

	// Auth routes (public)
	mux.HandleFunc("POST /api/auth/register", auth.Register)
	mux.HandleFunc("POST /api/auth/login/request", auth.RequestOTP)
	mux.HandleFunc("POST /api/auth/login/verify", auth.VerifyOTP)
	mux.HandleFunc("GET /api/auth/status", auth.ActivationStatus)

	// Jobs (public read)
	mux.HandleFunc("GET /api/jobs", jobs.ListJobs)
	mux.HandleFunc("GET /api/jobs/{id}", jobs.GetJob)

	// Protected middleware
	protected := middleware.Auth(jwtSecret)

	// Profile
	mux.Handle("GET /api/profile", protected(http.HandlerFunc(auth.GetProfile)))
	mux.Handle("PUT /api/profile", protected(http.HandlerFunc(jobs.UpdateProfile)))

	// Jobs (protected write)
	mux.Handle("POST /api/jobs", protected(http.HandlerFunc(jobs.CreateJob)))
	mux.Handle("GET /api/jobs/my", protected(http.HandlerFunc(jobs.MyJobs)))
	mux.Handle("DELETE /api/jobs/{id}", protected(http.HandlerFunc(jobs.DeleteJob)))

	// Wrap entire mux with CORS
	return corsMiddleware(mux)
}

// corsMiddleware adds CORS headers for frontend interaction.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
