package logfx

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"

	"go.opentelemetry.io/otel/log"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

const (
	DefaultScopeName = "default"
)

type OTLPConnectionResource interface {
	GetLoggerProvider() *sdklog.LoggerProvider
	GetMeterProvider() *sdkmetric.MeterProvider
	GetTracerProvider() *sdktrace.TracerProvider
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
	InnerPropagator     propagation.TextMapPropagator
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
		InnerPropagator: propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{}, // W3C Trace Context
			propagation.Baggage{},      // W3C Baggage
		),
		Writer: os.Stdout,

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

func (l *Logger) PropagatorExtract(ctx context.Context, headers http.Header) context.Context {
	return l.InnerPropagator.Extract(ctx, propagation.HeaderCarrier(headers))
}

func (l *Logger) PropagatorInject(ctx context.Context, headers http.Header) {
	l.InnerPropagator.Inject(ctx, propagation.HeaderCarrier(headers))
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

// EnableOTLP enables OTLP features.
func (l *Logger) EnableOTLP(conn OTLPConnectionResource) {
	innerLoggerProvider := conn.GetLoggerProvider()
	l.InnerLoggerProvider = innerLoggerProvider

	innerMeterProvider := conn.GetMeterProvider()
	l.InnerMeterProvider = innerMeterProvider

	innerTracerProvider := conn.GetTracerProvider()
	l.InnerTracerProvider = innerTracerProvider

	l.InnerHandler.enableOTLPExport(l.InnerLoggerProvider)
}
