package router

import (
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"

	"JumysTab/internal/handler"
	"JumysTab/internal/middleware"
)

func New(auth *handler.AuthHandler, jobs *handler.JobHandler, jwtSecret string, frontendRoot string) (http.Handler, error) {
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

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})

	staticHandler, err := newStaticHandler(frontendRoot)
	if err != nil {
		return nil, err
	}
	mux.Handle("/", staticHandler)

	// Wrap entire mux with CORS
	return corsMiddleware(mux), nil
}

func newStaticHandler(frontendRoot string) (http.Handler, error) {
	stat, err := os.Stat(frontendRoot)
	if err != nil {
		return nil, err
	}
	if !stat.IsDir() {
		return nil, fs.ErrInvalid
	}

	fileServer := http.FileServer(http.Dir(frontendRoot))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			r = cloneRequestWithPath(r, "/index.html")
		}

		fileServer.ServeHTTP(w, r)
	}), nil
}

func cloneRequestWithPath(r *http.Request, path string) *http.Request {
	clone := r.Clone(r.Context())
	clone.URL = newCopyURL(r.URL)
	clone.URL.Path = path
	return clone
}

func newCopyURL(src *url.URL) *url.URL {
	if src == nil {
		return &url.URL{}
	}

	dst := *src
	return &dst
}

func ResolveFrontendRoot() (string, error) {
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)

	candidates := []string{
		"frontend",
		filepath.Join(exeDir, "frontend"),
		filepath.Join(exeDir, "..", "frontend"),
		filepath.Join(exeDir, "..", "..", "frontend"),
	}

	for _, candidate := range candidates {
		info, err := os.Stat(candidate)
		if err == nil && info.IsDir() {
			return candidate, nil
		}
	}

	return "", os.ErrNotExist
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
