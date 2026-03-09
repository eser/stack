package profiling

import (
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
)

func RegisterHTTPRoutes(routes *httpfx.Router, config *httpfx.Config) {
	if !config.ProfilingEnabled {
		return
	}

	// SECURITY: pprof endpoints expose sensitive runtime info (heap, goroutines, CPU profiles).
	// Protect with a shared secret token via PPROF_TOKEN env var.
	pprofToken := os.Getenv("PPROF_TOKEN")
	if pprofToken == "" {
		slog.Warn(
			"PPROF_TOKEN not set - pprof endpoints are unprotected. Set PPROF_TOKEN env var in production.",
		)
	}

	guard := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if pprofToken != "" && r.URL.Query().Get("token") != pprofToken {
				http.Error(w, "Forbidden", http.StatusForbidden)

				return
			}

			next(w, r)
		}
	}

	mux := routes.GetMux()

	mux.HandleFunc("/debug/pprof/", guard(pprof.Index))
	mux.HandleFunc("/debug/pprof/cmdline", guard(pprof.Cmdline))
	mux.HandleFunc("/debug/pprof/profile", guard(pprof.Profile))
	mux.HandleFunc("/debug/pprof/symbol", guard(pprof.Symbol))
	mux.HandleFunc("/debug/pprof/trace", guard(pprof.Trace))
}
