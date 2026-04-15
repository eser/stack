package logfx_test

import (
	"bytes"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	DefaultScopeName = "default"
)

type mockFailWriter struct{}

func (m *mockFailWriter) Write(p []byte) (int, error) {
	return 0, errors.New("failed to write") //nolint:err113
}

func TestNewHandler(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		scopeName   string
		writer      *bytes.Buffer
		config      *logfx.Config
		expectedErr error
	}{
		{
			name:      "ValidConfig",
			scopeName: DefaultScopeName,
			writer:    &bytes.Buffer{},
			config: &logfx.Config{
				Level:                         "INFO",
				PrettyMode:                    true,
				AddSource:                     false,
				DefaultLogger:                 false,
				NoNativeCollectorRegistration: false,
			},
			expectedErr: nil,
		},
		{
			name:      "InvalidLogLevel",
			scopeName: DefaultScopeName,
			writer:    &bytes.Buffer{},
			config: &logfx.Config{
				Level:                         "INVALID",
				PrettyMode:                    true,
				AddSource:                     false,
				DefaultLogger:                 false,
				NoNativeCollectorRegistration: false,
			},
			expectedErr: logfx.ErrFailedToParseLogLevel,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handler := logfx.NewHandler(
				tt.scopeName,
				tt.writer,
				tt.config,
			) // nil registry for testing

			if tt.expectedErr != nil {
				require.Error(t, handler.InitError)
				require.ErrorIs(t, handler.InitError, tt.expectedErr)

				return
			}

			require.NoError(t, handler.InitError)
			assert.NotNil(t, handler)
		})
	}
}

func TestHandler_Handle(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name      string
		scopeName string
		level     string
		record    slog.Record
		expected  string
	}{
		{
			name:      "Trace",
			scopeName: DefaultScopeName,
			level:     "trace",
			record:    slog.NewRecord(time.Time{}, logfx.LevelTrace, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[94mTRACE\x1b[0m   test\n\n",
		},
		{
			name:      "Debug",
			scopeName: DefaultScopeName,
			level:     "debug",
			record:    slog.NewRecord(time.Time{}, logfx.LevelDebug, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[94mDEBUG\x1b[0m   test\n\n",
		},
		{
			name:      "Info",
			scopeName: DefaultScopeName,
			level:     "info",
			record:    slog.NewRecord(time.Time{}, logfx.LevelInfo, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[32mINFO\x1b[0m    test\n\n",
		},
		{
			name:      "Warn",
			scopeName: DefaultScopeName,
			level:     "warn",
			record:    slog.NewRecord(time.Time{}, logfx.LevelWarn, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[33mWARN\x1b[0m    test\n\n",
		},
		{
			name:      "Error",
			scopeName: DefaultScopeName,
			level:     "error",
			record:    slog.NewRecord(time.Time{}, logfx.LevelError, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[31mERROR\x1b[0m   test\n\n",
		},
		{
			name:      "Fatal",
			scopeName: DefaultScopeName,
			level:     "fatal",
			record:    slog.NewRecord(time.Time{}, logfx.LevelFatal, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[31mFATAL\x1b[0m   test\n\n",
		},
		{
			name:      "Panic",
			scopeName: DefaultScopeName,
			level:     "panic",
			record:    slog.NewRecord(time.Time{}, logfx.LevelPanic, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[31mPANIC\x1b[0m   test\n\n",
		},
		{
			name:      "UnknownLevel",
			scopeName: DefaultScopeName,
			level:     "panic",
			record:    slog.NewRecord(time.Time{}, 77, "test", 0),
			expected:  "\x1b[90m00:00:00.000\x1b[0m \x1b[31mPANIC+61\x1b[0m test\n\n",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			writer := &bytes.Buffer{}
			handler := logfx.NewHandler(tt.scopeName, writer, &logfx.Config{ //nolint:exhaustruct
				Level:      tt.level,
				PrettyMode: true,
			})

			err := handler.Handle(t.Context(), tt.record)
			require.NoError(t, err)

			assert.Contains(t, writer.String(), tt.expected)
		})
	}

	t.Run("failed to write log", func(t *testing.T) {
		t.Parallel()

		handler := logfx.NewHandler(
			DefaultScopeName,
			&mockFailWriter{},
			&logfx.Config{ //nolint:exhaustruct
				Level:      "info",
				PrettyMode: true,
			},
		)
		err := handler.Handle(t.Context(), slog.NewRecord(time.Time{}, slog.LevelInfo, "test", 0))
		assert.EqualError(t, err, "failed to write log: failed to write")
	})
}

func TestHandler_WithAttrs(t *testing.T) {
	t.Parallel()

	handler := logfx.NewHandler(
		DefaultScopeName,
		&bytes.Buffer{},
		&logfx.Config{ //nolint:exhaustruct
			Level: "info",
		},
	)
	newHandler := handler.WithAttrs(make([]slog.Attr, 0))
	// FIXME(@eser) should equal or not?
	assert.Equal(t, handler, newHandler)
}

func TestHandler_WithGroup(t *testing.T) {
	t.Parallel()

	handler := logfx.NewHandler(
		DefaultScopeName,
		&bytes.Buffer{},
		&logfx.Config{ //nolint:exhaustruct
			Level: "info",
		},
	)
	newHandler := handler.WithGroup("test")
	assert.NotEqual(t, handler, newHandler)
}
