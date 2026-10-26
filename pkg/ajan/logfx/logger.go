package logfx

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"
)

const (
	DefaultScopeName = "default"
)

// TelemetryProviders are the OpenTelemetry providers a logger exports
// through. They are the API interfaces, not the SDK types, so logfx links no
// OpenTelemetry SDK: the SDK-backed entry point is logfx/otlp, which only
// native builds and services import. A nil provider leaves the current one in
// place.
type TelemetryProviders struct {
	Logger log.LoggerProvider
	Meter  metric.MeterProvider
	Tracer trace.TracerProvider
}

// LoggerInstance provides a clean interface for creating and managing loggers.
type LoggerInstance struct {
	logger log.Logger
}

func NewLoggerInstance() *LoggerInstance {
	return &LoggerInstance{
		NewNoopLoggerProvider().Logger("noop"),
	}
}

func (t *LoggerInstance) Bind(logger log.Logger) {
	t.logger = logger
}

type Logger struct {
	*slog.Logger

	Config *Config

	InnerHandler        *Handler
	InnerLoggerProvider log.LoggerProvider
	InnerMeterProvider  metric.MeterProvider
	InnerTracerProvider trace.TracerProvider
	Writer              io.Writer

	ScopeName string
}

func NewLogger(options ...NewLoggerOption) *Logger {
	logger := &Logger{
		Logger: nil,

		Config: &Config{ //nolint:exhaustruct
			Level: DefaultLogLevel,
		},

		InnerHandler:        nil,
		InnerLoggerProvider: NewNoopLoggerProvider(),
		InnerMeterProvider:  NewNoopMeterProvider(),
		InnerTracerProvider: NewNoopTracerProvider(),
		Writer:              os.Stdout,

		ScopeName: DefaultScopeName,
	}

	for _, option := range options {
		option(logger)
	}

	if logger.Logger == nil {
		logger.InnerHandler = NewHandler(logger.ScopeName, logger.Writer, logger.Config)
		logger.Logger = slog.New(logger.InnerHandler)

		if logger.InnerHandler.InitError != nil {
			logger.Warn(
				"an error occurred while initializing the logger",
				slog.String("error", logger.InnerHandler.InitError.Error()),
				slog.Any("config", logger.Config),
			)
		}
	}

	if logger.Config.DefaultLogger {
		logger.SetAsDefault()
	}

	return logger
}

func (l *Logger) SetAsDefault() {
	slog.SetDefault(l.Logger)
}

func (l *Logger) Printf(format string, args ...any) {
	l.Log(context.Background(), slog.LevelInfo, fmt.Sprintf(format, args...))
}

// Trace logs at [LevelTrace].
func (l *Logger) Trace(msg string, args ...any) {
	l.Log(context.Background(), LevelTrace, msg, args...)
}

// TraceContext logs at [LevelTrace] with the given context.
func (l *Logger) TraceContext(ctx context.Context, msg string, args ...any) {
	l.Log(ctx, LevelTrace, msg, args...)
}

// Fatal logs at [LevelFatal].
func (l *Logger) Fatal(msg string, args ...any) {
	l.Log(context.Background(), LevelFatal, msg, args...)
}

// Fatalf logs at [LevelFatal] and exits.
func (l *Logger) Fatalf(format string, args ...any) {
	l.Log(context.Background(), LevelFatal, fmt.Sprintf(format, args...))
	// os.Exit(1)
}

// FatalContext logs at [LevelFatal] with the given context.
func (l *Logger) FatalContext(ctx context.Context, msg string, args ...any) {
	l.Log(ctx, LevelFatal, msg, args...)
}

// Panic logs at [LevelPanic].
func (l *Logger) Panic(msg string, args ...any) {
	l.Log(context.Background(), LevelPanic, msg, args...)
}

// PanicContext logs at [LevelPanic] with the given context.
func (l *Logger) PanicContext(ctx context.Context, msg string, args ...any) {
	l.Log(ctx, LevelPanic, msg, args...)
}

func (l *Logger) StartSpan(
	ctx context.Context,
	name string,
	attrs ...any,
) (context.Context, *Span) {
	return StartSpan(ctx, l.InnerTracerProvider, name, attrs...)
}

func (l *Logger) NewMetricsBuilder(name string) *MetricsBuilder {
	return NewMetricsBuilder(l.InnerMeterProvider, name)
}

// EnableTelemetry makes the logger export through the given providers:
// every later record goes to the logger provider, and StartSpan and
// NewMetricsBuilder use the tracer and meter providers. logfx/otlp's Enable
// calls it with the providers of an OTLP connection.
func (l *Logger) EnableTelemetry(providers TelemetryProviders) {
	if providers.Meter != nil {
		l.InnerMeterProvider = providers.Meter
	}

	if providers.Tracer != nil {
		l.InnerTracerProvider = providers.Tracer
	}

	if providers.Logger != nil {
		l.InnerLoggerProvider = providers.Logger
		l.InnerHandler.enableOTLPExport(l.InnerLoggerProvider)
	}
}
