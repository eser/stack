package profiling

import (
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"
	"net/http/pprof"
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

// ErrProfilingTokenNotSet is returned when profiling is enabled without a
// token, so the endpoints would have no protection.
var ErrProfilingTokenNotSet = errors.New(
	"profiling is enabled but profiling_token is not set; set it or turn profiling off",
)

// RegisterHTTPRoutes mounts the net/http/pprof handlers under /debug/pprof/
// when config.ProfilingEnabled is set. They reveal memory, goroutine stacks
// and the command line, so every request must carry
// "Authorization: Bearer <config.ProfilingToken>"; any other request is
// answered 403. The token is never read from the query string, because URLs
// reach access logs.
//
// With profiling enabled and no token, nothing is mounted and
// ErrProfilingTokenNotSet is returned.
func RegisterHTTPRoutes(routes *httpfx.Router, config *httpfx.Config) error {
	if !config.ProfilingEnabled {
		return nil
	}

	if config.ProfilingToken == "" {
		return ErrProfilingTokenNotSet
	}

	guard := tokenGuard(config.ProfilingToken)
	mux := routes.GetMux()

	mux.HandleFunc("/debug/pprof/", guard(pprof.Index))
	mux.HandleFunc("/debug/pprof/cmdline", guard(pprof.Cmdline))
	mux.HandleFunc("/debug/pprof/profile", guard(pprof.Profile))
	mux.HandleFunc("/debug/pprof/symbol", guard(pprof.Symbol))
	mux.HandleFunc("/debug/pprof/trace", guard(pprof.Trace))

	return nil
}

// tokenGuard lets a request through only when its bearer token equals token.
func tokenGuard(token string) func(http.HandlerFunc) http.HandlerFunc {
	want := sha256.Sum256([]byte(token))

	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if !hasBearerToken(r, want) {
				http.Error(w, http.StatusText(http.StatusForbidden), http.StatusForbidden)

				return
			}

			next(w, r)
		}
	}
}

// hasBearerToken reports whether the Authorization header of r carries a
// bearer token whose SHA-256 digest is want. Comparing fixed-size digests in
// constant time also keeps the token's length from showing in the timing.
func hasBearerToken(r *http.Request, want [sha256.Size]byte) bool {
	got, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || got == "" {
		return false
	}

	gotSum := sha256.Sum256([]byte(got))

	return subtle.ConstantTimeCompare(gotSum[:], want[:]) == 1
}
