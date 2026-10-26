package logfx

import (
	"io"
	"log/slog"
)

type NewLoggerOption func(*Logger)

func WithScopeName(scopeName string) NewLoggerOption {
	return func(logger *Logger) {
		logger.ScopeName = scopeName
	}
}

func WithConfig(config *Config) NewLoggerOption {
	return func(logger *Logger) {
		logger.Config = config
	}
}

func WithWriter(writer io.Writer) NewLoggerOption {
	return func(logger *Logger) {
		logger.Writer = writer
	}
}

func WithFromSlog(slog *slog.Logger) NewLoggerOption {
	return func(logger *Logger) {
		logger.Logger = slog
	}
}

func WithLevel(level slog.Level) NewLoggerOption {
	return func(logger *Logger) {
		logger.Config.Level = level.String()
	}
}

func WithDefaultLogger() NewLoggerOption {
	return func(logger *Logger) {
		logger.Config.DefaultLogger = true
	}
}

func WithPrettyMode(pretty bool) NewLoggerOption {
	return func(logger *Logger) {
		logger.Config.PrettyMode = pretty
	}
}

func WithAddSource(addSource bool) NewLoggerOption {
	return func(logger *Logger) {
		logger.Config.AddSource = addSource
	}
}
