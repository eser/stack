package appcontext_test

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/api/adapters/appcontext"
	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/httpfx"
)

// New reads config.json and .env from the working directory and then the
// process environment, so these tests set both. t.Chdir and t.Setenv rule
// out t.Parallel for every test in this file.

// useConfigDir moves the test into a fresh directory holding files, and clears
// the environment variables the tests read so a developer's shell cannot
// change the outcome.
func useConfigDir(t *testing.T, files map[string]string) {
	t.Helper()

	dir := t.TempDir()

	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	t.Chdir(dir)

	// lib.EnvGetCurrent reads the lowercase "env" to pick config.<env>.json.
	for _, key := range []string{"env", "ENV", "NAME", "HTTP__ADDR", "HTTP__HEALTH_CHECK", "LOG__LEVEL"} {
		t.Setenv(key, "") // restores the original value when the test ends
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
	}

	// Port 0 lets the HTTP server New starts bind any free port, and the
	// error level keeps its start and stop messages out of the test output.
	t.Setenv("HTTP__ADDR", "127.0.0.1:0")
	t.Setenv("LOG__LEVEL", "ERROR")
}

// newApp calls New and stops the HTTP server it started when the test ends.
func newApp(t *testing.T) *appcontext.AppContext {
	t.Helper()

	ctx, cancel := context.WithCancel(t.Context())

	app, err := appcontext.New(ctx)
	if err != nil {
		cancel()
		t.Fatalf("New() = %v", err)
	}

	t.Cleanup(func() {
		// Process.Cancel stops the goroutines; Shutdown waits for them on the
		// still-open base context, and only then is that context cancelled.
		app.Process.Cancel()
		app.Process.Shutdown()
		cancel()
	})

	return app
}

func serve(t *testing.T, app *appcontext.AppContext, path string) *httptest.ResponseRecorder {
	t.Helper()

	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil)
	app.Router.GetMux().ServeHTTP(rec, req)

	return rec
}

func TestNewWiresTheRoutesAndTheServer(t *testing.T) {
	useConfigDir(t, map[string]string{
		"config.json": `{"name": "orders-api"}`,
	})

	app := newApp(t)

	root := serve(t, app, "/")
	if root.Code != http.StatusOK || root.Body.String() != "orders-api is running" {
		t.Errorf("GET / = (%d, %q), want (200, %q)", root.Code, root.Body.String(), "orders-api is running")
	}

	health := serve(t, app, "/health")

	var body struct {
		Status string `json:"status"`
	}

	if err := json.Unmarshal(health.Body.Bytes(), &body); err != nil || health.Code != http.StatusOK {
		t.Fatalf("GET /health = (%d, %q), want 200 with a JSON body", health.Code, health.Body.String())
	}

	if body.Status != "healthy" {
		t.Errorf("GET /health status = %q, want %q", body.Status, "healthy")
	}

	if names := app.Process.RunningNames(); !slices.Contains(names, "http-server") {
		t.Errorf("Process.RunningNames() = %v, want it to include %q", names, "http-server")
	}
}

func TestNewAnswersUnknownPathsWithNotFound(t *testing.T) {
	cases := []struct {
		name   string
		config string
		path   string
	}{
		{name: "unregistered path", config: `{}`, path: "/healthz"},
		{name: "health route turned off", config: `{"http": {"health_check": false}}`, path: "/health"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			useConfigDir(t, map[string]string{"config.json": tc.config})

			app := newApp(t)

			if got := serve(t, app, tc.path).Code; got != http.StatusNotFound {
				t.Errorf("GET %s = %d, want 404", tc.path, got)
			}
		})
	}
}

func TestNewConfigPrecedence(t *testing.T) {
	cases := []struct {
		name   string
		files  map[string]string
		env    map[string]string
		wanted string
	}{
		{
			name:   "default without any source",
			files:  map[string]string{},
			wanted: "eser-go-svc",
		},
		{
			name:   "config file over the default",
			files:  map[string]string{"config.json": `{"name": "from-file"}`},
			wanted: "from-file",
		},
		{
			name: ".env over the config file",
			files: map[string]string{
				"config.json": `{"name": "from-file"}`,
				".env":        "NAME=from-dotenv\n",
			},
			wanted: "from-dotenv",
		},
		{
			name: "process environment over both",
			files: map[string]string{
				"config.json": `{"name": "from-file"}`,
				".env":        "NAME=from-dotenv\n",
			},
			env:    map[string]string{"NAME": "from-env"},
			wanted: "from-env",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			useConfigDir(t, tc.files)

			for key, value := range tc.env {
				t.Setenv(key, value)
			}

			if got := newApp(t).Config.AppName; got != tc.wanted {
				t.Errorf("Config.AppName = %q, want %q", got, tc.wanted)
			}
		})
	}
}

func TestNewRejectsBadConfig(t *testing.T) {
	cases := []struct {
		name    string
		config  string
		wantErr error
	}{
		{
			name:    "malformed JSON",
			config:  `{"name": "orders-api"`,
			wantErr: configfx.ErrFailedToParseJSONFile,
		},
		{
			name:    "value of the wrong type",
			config:  `{"http": {"read_timeout": "soon"}}`,
			wantErr: configfx.ErrInvalidConfigValue,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			useConfigDir(t, map[string]string{"config.json": tc.config})

			app, err := appcontext.New(t.Context())
			if !errors.Is(err, tc.wantErr) {
				t.Errorf("New() = %v, want %v", err, tc.wantErr)
			}

			if app != nil {
				t.Errorf("New() returned an AppContext alongside error %v", err)
			}
		})
	}
}

// New listens before it returns, so an address the server cannot listen on
// fails New instead of being logged after New reported a healthy start.
func TestNewFailsWhenTheServerCannotListen(t *testing.T) {
	occupied, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("occupy a port: %v", err)
	}

	defer func() {
		_ = occupied.Close() // the test is over; a close error changes nothing
	}()

	cases := []struct {
		name string
		addr string
	}{
		{name: "port in use", addr: occupied.Addr().String()},
		{name: "port out of range", addr: "127.0.0.1:70000"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			useConfigDir(t, map[string]string{"config.json": `{}`})
			t.Setenv("HTTP__ADDR", tc.addr)

			app, err := appcontext.New(t.Context())
			if !errors.Is(err, httpfx.ErrHTTPServiceNetListenError) {
				t.Fatalf("New() = %v, want %v", err, httpfx.ErrHTTPServiceNetListenError)
			}

			if !strings.Contains(err.Error(), tc.addr) {
				t.Errorf("New() = %q, want the address %q in the message", err, tc.addr)
			}

			if app != nil {
				t.Errorf("New() returned an AppContext alongside error %v", err)
			}
		})
	}
}
