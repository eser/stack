// Package appcontext provides the composition root for the application.
// It wires together all adapters and business logic dependencies.
package appcontext

import (
	"context"
	"fmt"

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

// New creates a new AppContext with all dependencies initialized.
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
	router := httpfx.NewRouter("")

	healthcheck.RegisterHTTPRoutes(router, &cfg.HTTP)

	router.Route("GET /", func(reqCtx *httpfx.Context) httpfx.Result {
		return reqCtx.Results.PlainText([]byte(cfg.AppName + " is running"))
	}).
		HasSummary("Root").
		HasDescription("Service information endpoint")

	// 5. Start HTTP server
	httpService := httpfx.NewHTTPService(&cfg.HTTP, router, logger)

	process.StartGoroutine("http-server", func(goroutineCtx context.Context) error {
		cleanup, startErr := httpService.Start(goroutineCtx)
		if startErr != nil {
			return fmt.Errorf("starting HTTP server: %w", startErr)
		}

		<-goroutineCtx.Done()
		cleanup()

		return nil
	})

	logger.Info("application initialized",
		"name", cfg.AppName,
		"env", cfg.AppEnv,
		"version", cfg.AppVersion,
	)

	return &AppContext{
		Config:  cfg,
		Logger:  logger,
		Router:  router,
		HTTP:    httpService,
		Process: process,
	}, nil
}
