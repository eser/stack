package logfx_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTracerStartSpan(t *testing.T) { //nolint:funlen
	t.Parallel()

	logger := logfx.NewLogger()
	ctx := t.Context()

	t.Run("basic span creation", func(t *testing.T) {
		t.Parallel()

		spanCtx, span := logger.StartSpan(ctx, "test-operation")
		defer span.End()

		assert.NotNil(t, spanCtx)
		assert.NotNil(t, span)
		assert.NotEqual(t, ctx, spanCtx) // Should return a new context with span
	})

	t.Run("span with slog attributes", func(t *testing.T) {
		t.Parallel()

		spanCtx, span := logger.StartSpan(
			ctx,
			"database-operation",
			slog.String("provider", "postgres"),
			slog.String("table", "users"),
			slog.Int("timeout", 30),
			slog.Bool("cached", true),
			slog.Time("created_at", time.Now()),
		)
		defer span.End()

		assert.NotNil(t, spanCtx)
		assert.NotNil(t, span)

		// Add more attributes after creation
		span.SetAttributes(
			slog.String("query_id", "123"),
			slog.Float64("duration", 1.234),
		)

		// Add an event
		span.AddEvent("query_executed", slog.String("result", "success"))
	})

	t.Run("span with error recording", func(t *testing.T) {
		t.Parallel()

		spanCtx, span := logger.StartSpan(ctx, "error-operation")
		defer span.End()

		// Simulate an error
		testErr := assert.AnError

		// Record the error
		span.RecordError(testErr, slog.String("source", "test"))

		assert.NotNil(t, spanCtx)
		assert.NotNil(t, span)
	})

	t.Run("span with nil error should not panic", func(t *testing.T) {
		t.Parallel()

		spanCtx, span := logger.StartSpan(ctx, "no-error-operation")
		defer span.End()

		// Should not panic when recording nil error
		assert.NotPanics(t, func() {
			span.RecordError(nil)
		})

		assert.NotNil(t, spanCtx)
		assert.NotNil(t, span)
	})
}

func TestLoggerStartSpanIntegration(t *testing.T) {
	t.Parallel()

	// Test the integration as described in the user requirements
	logger := logfx.NewLogger()
	ctx := t.Context()

	// Simulate the user's desired usage pattern
	func() {
		spanCtx, span := logger.StartSpan(
			ctx,
			"database connection",
			slog.String("provider", "postgres"),
			slog.String("time", time.Now().Format(time.RFC3339)),
		)
		defer span.End()

		// Simulate some database operation
		dbConn := func() error {
			// Simulate work
			lib.SleepContext(t.Context(), 1*time.Millisecond)

			return assert.AnError // Simulate an error
		}

		err := dbConn()
		if err != nil {
			span.RecordError(err)
		}

		span.AddEvent("connected_to_db", slog.Bool("done", true))

		require.NotNil(t, spanCtx)
		require.NotNil(t, span)
	}()
}

func TestAttributeConversion(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		attr slog.Attr
	}{
		{
			name: "string attribute",
			attr: slog.String("key", "value"),
		},
		{
			name: "int attribute",
			attr: slog.Int("key", 42),
		},
		{
			name: "int64 attribute",
			attr: slog.Int64("key", 42),
		},
		{
			name: "float64 attribute",
			attr: slog.Float64("key", 3.14),
		},
		{
			name: "bool attribute",
			attr: slog.Bool("key", true),
		},
		{
			name: "time attribute",
			attr: slog.Time("key", time.Now()),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			attr := logfx.ConvertSlogAttrToOtelAttr(tt.attr)
			assert.Equal(t, "key", string(attr.Key))
		})
	}
}

func TestConvertSlogAttrsToOtel(t *testing.T) {
	t.Parallel()

	t.Run("mixed attributes", func(t *testing.T) {
		t.Parallel()

		attrs := logfx.ConvertSlogAttrsToOtelAttr(
			[]any{
				slog.String("str", "value"),
				slog.Int("num", 42),
				slog.Bool("flag", true),
			},
		)

		assert.Len(t, attrs, 3)
	})
}
