package logfx_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
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

// TestNewHandler_InvalidLevelFallsBackToInfo checks the handler stays usable
// when the configured level does not parse: it filters at Info instead of
// panicking on a nil level, and keeps the parse error in InitError.
func TestNewHandler_InvalidLevelFallsBackToInfo(t *testing.T) {
	t.Parallel()

	writer := &bytes.Buffer{}
	handler := logfx.NewHandler(DefaultScopeName, writer, &logfx.Config{ //nolint:exhaustruct // only the level matters to this test
		Level: "LOUD",
	})

	require.ErrorIs(t, handler.InitError, logfx.ErrFailedToParseLogLevel)
	assert.Contains(t, handler.InitError.Error(), `level="LOUD"`)

	ctx := t.Context()

	require.NotPanics(t, func() {
		assert.True(t, handler.Enabled(ctx, slog.LevelInfo))
		assert.True(t, handler.Enabled(ctx, slog.LevelError))
		assert.False(t, handler.Enabled(ctx, slog.LevelDebug))
	})
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

// TestHandler_WithAttrs checks the JSON output: the derived handler writes its
// attributes on every record, and the handler it came from does not.
func TestHandler_WithAttrs(t *testing.T) {
	t.Parallel()

	writer := &bytes.Buffer{}
	handler := logfx.NewHandler(
		DefaultScopeName,
		writer,
		&logfx.Config{ //nolint:exhaustruct
			Level: "info",
		},
	)
	derived := handler.WithAttrs([]slog.Attr{slog.String("request_id", "r-1")})

	require.NoError(t, derived.Handle(t.Context(), slog.NewRecord(time.Time{}, slog.LevelInfo, "derived", 0)))
	assert.Contains(t, writer.String(), `"request_id":"r-1"`)

	writer.Reset()

	require.NoError(t, handler.Handle(t.Context(), slog.NewRecord(time.Time{}, slog.LevelInfo, "original", 0)))
	assert.Contains(t, writer.String(), `"msg":"original"`)
	assert.NotContains(t, writer.String(), "request_id")
}

// TestHandler_WithGroup checks the JSON output: attributes of a record handled
// by the derived handler are nested under the group name.
func TestHandler_WithGroup(t *testing.T) {
	t.Parallel()

	writer := &bytes.Buffer{}
	handler := logfx.NewHandler(
		DefaultScopeName,
		writer,
		&logfx.Config{ //nolint:exhaustruct
			Level: "info",
		},
	)
	derived := handler.WithGroup("http")

	rec := slog.NewRecord(time.Time{}, slog.LevelInfo, "request", 0)
	rec.AddAttrs(slog.Int("status", 200))

	require.NoError(t, derived.Handle(t.Context(), rec))
	assert.Contains(t, writer.String(), `"http":{"status":200}`)
}

// prettyAttrLine is one attribute line of the pretty output: a tab, the key
// padded to PrettyModeKeyMaxLength, then "= value".
func prettyAttrLine(key string, value string) string {
	return fmt.Sprintf("\t%-*s= %s", logfx.PrettyModeKeyMaxLength, key, value)
}

// prettyAttrLines drops the first line of a pretty record, which holds the
// time, the level and the message, and returns the attribute lines after it.
func prettyAttrLines(output string) []string {
	lines := strings.Split(strings.TrimRight(output, "\n"), "\n")

	return lines[1:]
}

type userValuer struct {
	id string
}

func (u userValuer) LogValue() slog.Value {
	return slog.StringValue("user-" + u.id)
}

// TestHandler_PrettyModeKeepsDerivedAttrs checks that pretty mode prints what
// WithAttrs and WithGroup added: handler attributes first, then the record's
// own, each key prefixed with its groups.
func TestHandler_PrettyModeKeepsDerivedAttrs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		derive      func(h slog.Handler) slog.Handler
		recordAttrs []slog.Attr
		expected    []string
	}{
		{
			name: "WithAttrs adds its attributes before the record's own",
			derive: func(h slog.Handler) slog.Handler {
				return h.WithAttrs([]slog.Attr{slog.String("request_id", "r-1")})
			},
			recordAttrs: []slog.Attr{slog.Int("status", 200)},
			expected: []string{
				prettyAttrLine("request_id", "r-1"),
				prettyAttrLine("status", "200"),
			},
		},
		{
			name: "WithGroup prefixes the record's attributes",
			derive: func(h slog.Handler) slog.Handler {
				return h.WithGroup("http")
			},
			recordAttrs: []slog.Attr{slog.Int("status", 200)},
			expected: []string{
				prettyAttrLine("http.status", "200"),
			},
		},
		{
			name: "attributes keep the groups open when they were added",
			derive: func(h slog.Handler) slog.Handler {
				return h.WithAttrs([]slog.Attr{slog.String("request_id", "r-1")}).
					WithGroup("http").
					WithAttrs([]slog.Attr{slog.String("method", "GET")}).
					WithGroup("response")
			},
			recordAttrs: []slog.Attr{slog.Int("status", 200)},
			expected: []string{
				prettyAttrLine("request_id", "r-1"),
				prettyAttrLine("http.method", "GET"),
				prettyAttrLine("http.response.status", "200"),
			},
		},
		{
			name: "group attributes are flattened and an empty group key inlines them",
			derive: func(h slog.Handler) slog.Handler {
				return h.WithGroup("http").WithAttrs([]slog.Attr{
					slog.Group("client", slog.String("ip", "10.0.0.1")),
				})
			},
			recordAttrs: []slog.Attr{
				slog.Group("", slog.Int("status", 200)),
				slog.Group("timing", slog.Duration("total", 1500*time.Millisecond)),
			},
			expected: []string{
				prettyAttrLine("http.client.ip", "10.0.0.1"),
				prettyAttrLine("http.status", "200"),
				prettyAttrLine("http.timing.total", "1.5s"),
			},
		},
		{
			name: "empty attributes and empty groups are dropped",
			derive: func(h slog.Handler) slog.Handler {
				return h.WithAttrs([]slog.Attr{{}, slog.Group("empty")})
			},
			recordAttrs: []slog.Attr{slog.Int("status", 200)},
			expected: []string{
				prettyAttrLine("status", "200"),
			},
		},
		{
			name: "a LogValuer added with WithAttrs is resolved",
			derive: func(h slog.Handler) slog.Handler {
				return h.WithAttrs([]slog.Attr{slog.Any("user", userValuer{id: "42"})})
			},
			recordAttrs: nil,
			expected: []string{
				prettyAttrLine("user", "user-42"),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			writer := &bytes.Buffer{}
			handler := logfx.NewHandler(DefaultScopeName, writer, &logfx.Config{
				Level:      "info",
				PrettyMode: true,
			})

			rec := slog.NewRecord(time.Time{}, slog.LevelInfo, "request handled", 0)
			rec.AddAttrs(tt.recordAttrs...)

			require.NoError(t, tt.derive(handler).Handle(t.Context(), rec))
			assert.Equal(t, tt.expected, prettyAttrLines(writer.String()))
		})
	}
}

// TestHandler_PrettyModeDerivedHandlersStayApart checks that deriving does not
// change the parent, and that two handlers derived from the same parent do not
// see each other's attributes.
func TestHandler_PrettyModeDerivedHandlersStayApart(t *testing.T) {
	t.Parallel()

	writer := &bytes.Buffer{}
	root := logfx.NewHandler(DefaultScopeName, writer, &logfx.Config{
		Level:      "info",
		PrettyMode: true,
	})

	// Three attributes leave spare capacity in the parent's slice, so a
	// sibling that appended in place would overwrite the other's attribute.
	parent := root.WithAttrs([]slog.Attr{
		slog.String("a", "1"),
		slog.String("b", "2"),
		slog.String("c", "3"),
	})
	left := parent.WithAttrs([]slog.Attr{slog.String("side", "left")})
	right := parent.WithAttrs([]slog.Attr{slog.String("side", "right")})

	parentLines := []string{
		prettyAttrLine("a", "1"),
		prettyAttrLine("b", "2"),
		prettyAttrLine("c", "3"),
	}

	tests := []struct {
		name     string
		handler  slog.Handler
		expected []string
	}{
		{name: "root", handler: root, expected: []string{}},
		{name: "parent", handler: parent, expected: parentLines},
		{name: "left", handler: left, expected: append(slices.Clone(parentLines), prettyAttrLine("side", "left"))},
		{name: "right", handler: right, expected: append(slices.Clone(parentLines), prettyAttrLine("side", "right"))},
	}

	// The cases share one writer, so they run in order.
	for _, tt := range tests {
		writer.Reset()

		rec := slog.NewRecord(time.Time{}, slog.LevelInfo, "message", 0)
		require.NoError(t, tt.handler.Handle(t.Context(), rec), tt.name)
		assert.Equal(t, tt.expected, prettyAttrLines(writer.String()), tt.name)
	}
}

// TestHandler_EmptyDerivationsReturnTheSameHandler checks the slog.Handler
// rules for an empty group name and an empty attribute list.
func TestHandler_EmptyDerivationsReturnTheSameHandler(t *testing.T) {
	t.Parallel()

	handler := logfx.NewHandler(DefaultScopeName, &bytes.Buffer{}, &logfx.Config{
		Level:      "info",
		PrettyMode: true,
	})

	assert.Same(t, handler, handler.WithGroup(""))
	assert.Same(t, handler, handler.WithAttrs(nil))
}

// TestLogger_PrettyModeWith checks the path a service takes: a logfx logger
// in pretty mode, narrowed with With and WithGroup.
func TestLogger_PrettyModeWith(t *testing.T) {
	t.Parallel()

	writer := &bytes.Buffer{}
	logger := logfx.NewLogger(
		logfx.WithWriter(writer),
		logfx.WithPrettyMode(true),
	)

	logger.With("request_id", "r-1").
		WithGroup("http").
		InfoContext(t.Context(), "request handled", "status", 200)

	assert.Equal(t, []string{
		prettyAttrLine("request_id", "r-1"),
		prettyAttrLine("http.status", "200"),
	}, prettyAttrLines(writer.String()))
}

// TestHandler_SubscribersReceiveDerivedAttrs checks that a subscriber, such as
// the OTLP export, gets the attributes added with WithAttrs and WithGroup as
// dotted keys, as pretty mode prints them.
func TestHandler_SubscribersReceiveDerivedAttrs(t *testing.T) {
	t.Parallel()

	handler := logfx.NewHandler(DefaultScopeName, &bytes.Buffer{}, &logfx.Config{
		Level: "info",
	})

	var received []slog.Attr

	handler.AddSubscriber(func(_ context.Context, rec slog.Record) error {
		rec.Attrs(func(attr slog.Attr) bool {
			received = append(received, attr)

			return true
		})

		return nil
	})

	derived := handler.WithAttrs([]slog.Attr{slog.String("request_id", "r-1")}).WithGroup("http")

	rec := slog.NewRecord(time.Time{}, slog.LevelInfo, "request handled", 0)
	rec.AddAttrs(slog.Int("status", 200))

	require.NoError(t, derived.Handle(t.Context(), rec))

	keys := make([]string, 0, len(received))
	for _, attr := range received {
		keys = append(keys, attr.Key+"="+attr.Value.String())
	}

	assert.Equal(t, []string{"request_id=r-1", "http.status=200"}, keys)
}
