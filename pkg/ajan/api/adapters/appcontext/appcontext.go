// Package appcontext provides the composition root for the application.
// It wires together all adapters and business logic dependencies.
package appcontext

import (
	"context"
	"fmt"
	"log/slog"

	esergo "github.com/eser/stack/pkg/ajan"
	"github.com/eser/stack/pkg/ajan/configfx"
	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/modules/healthcheck"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/processfx"
)

// AppContext holds all application-wide dependencies.
type AppContext struct {
	Config  *esergo.BaseConfig
	Logger  *logfx.Logger
	Router  *httpfx.Router
	HTTP    *httpfx.HTTPService
	Process *processfx.Process
}

// New creates a new AppContext with all dependencies initialized and the
// HTTP server listening. It returns an error when the configuration cannot be
// loaded or the server cannot listen on its address; the server is stopped
// by ending ctx or calling Process.Cancel, and Process.Shutdown waits for it.
func New(ctx context.Context) (*AppContext, error) {
	// 1. Load configuration
	cfg := &esergo.BaseConfig{} //nolint:exhaustruct

	manager := configfx.NewConfigManager()

	err := manager.Load(
		cfg,
		manager.FromJSONFile("config.json"),
		manager.FromEnvFile(".env", true),
		manager.FromSystemEnv(true),
	)
	if err != nil {
		return nil, fmt.Errorf("loading config: %w", err)
	}

	// 2. Initialize structured logger
	logger := logfx.NewLogger(
		logfx.WithConfig(&cfg.Log),
	)
	logger.SetAsDefault()

	// 3. Initialize process lifecycle manager
	process := processfx.New(ctx, logger)

	// 4. Set up HTTP router with healthcheck
	router := httpfx.NewRouter(logger)

	healthcheck.RegisterHTTPRoutes(router, &cfg.HTTP)

	// "{$}" matches "/" alone. A bare "GET /" also catches every unknown path,
	// so a probe on a route that does not exist would still get 200.
	router.Route("GET /{$}", func(reqCtx *httpfx.Context) httpfx.Result {
		return reqCtx.Results.PlainText([]byte(cfg.AppName + " is running"))
	}).
		HasSummary("Root").
		HasDescription("Service information endpoint")

	// 5. Start HTTP server. Start opens the listener before it returns, so a
	// port in use or a bad address fails New instead of only being logged by
	// a goroutine after New has reported success.
	httpService := httpfx.NewHTTPService(&cfg.HTTP, router, logger)

	cleanup, err := httpService.Start(process.Ctx)
	if err != nil {
		// Ends the signal watcher processfx.New started and waits for it.
		process.Cancel()
		process.Wait()

		// The error names the address; httpfx puts it in the message.
		return nil, fmt.Errorf("starting HTTP server: %w", err)
	}

	// The goroutine owns the running server: it shuts the server down when
	// the process context ends, and Process.Shutdown waits for it.
	process.StartGoroutine("http-server", func(goroutineCtx context.Context) error {
		<-goroutineCtx.Done()
		cleanup()

		return nil
	})

	logger.InfoContext(ctx, "application initialized",
		slog.String("name", cfg.AppName),
		slog.String("env", cfg.AppEnv),
		slog.String("version", cfg.AppVersion),
	)

	return &AppContext{
		Config:  cfg,
		Logger:  logger,
		Router:  router,
		HTTP:    httpService,
		Process: process,
	}, nil
}
