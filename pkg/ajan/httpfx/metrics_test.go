package httpfx_test

import (
	"log/slog"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/require"
)

func TestNewMetrics(t *testing.T) {
	t.Parallel()

	metricsBuilder := logfx.NewMetricsBuilder(
		logfx.NewNoopMeterProvider(),
		"httpfx_test",
	)

	metrics := httpfx.NewMetrics(metricsBuilder)
	require.NotNil(t, metrics)

	err := metrics.Init()
	require.NoError(t, err)

	// Test that we can use the metrics (basic smoke test)
	ctx := t.Context()

	// This should not panic - using slog.Attr directly
	metrics.RequestsTotal.Inc(ctx,
		slog.String("http.method", "GET"),
		slog.String("http.path", "/test"),
		slog.String("http.status_code", "200"))
	metrics.RequestDuration.RecordDuration(ctx, 100*time.Millisecond,
		slog.String("http.method", "GET"),
		slog.String("http.path", "/test"),
		slog.String("http.status_code", "200"))
}

func TestMetrics_Integration(t *testing.T) {
	t.Parallel()

	metricsBuilder := logfx.NewMetricsBuilder(
		logfx.NewNoopMeterProvider(),
		"httpfx_test",
	)

	metrics := httpfx.NewMetrics(metricsBuilder)
	require.NotNil(t, metrics)

	err := metrics.Init()
	require.NoError(t, err)

	ctx := t.Context()

	// Test various HTTP scenarios
	testCases := []struct {
		method   string
		endpoint string
		status   string
		duration time.Duration
	}{
		{"GET", "/api/users", "200", 150 * time.Millisecond},
		{"POST", "/api/users", "201", 250 * time.Millisecond},
		{"GET", "/api/users/123", "404", 50 * time.Millisecond},
		{"PUT", "/api/users/123", "500", 300 * time.Millisecond},
	}

	for _, tc := range testCases { //nolint:varnamelen
		metrics.RequestsTotal.Inc(ctx,
			slog.String("http.method", tc.method),
			slog.String("http.path", tc.endpoint),
			slog.String("http.status_code", tc.status))
		metrics.RequestDuration.RecordDuration(ctx, tc.duration,
			slog.String("http.method", tc.method),
			slog.String("http.path", tc.endpoint),
			slog.String("http.status_code", tc.status))
	}
}
