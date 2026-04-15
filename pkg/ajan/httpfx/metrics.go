package httpfx

import (
	"errors"
	"fmt"

	"github.com/eser/stack/pkg/ajan/logfx"
)

var (
	ErrFailedToBuildHTTPRequestsCounter = errors.New(
		"failed to build HTTP requests counter",
	)
	ErrFailedToBuildHTTPRequestDurationHistogram = errors.New(
		"failed to build HTTP request duration histogram",
	)
)

// Metrics holds HTTP-specific metrics using the clean logfx approach.
type Metrics struct {
	builder *logfx.MetricsBuilder

	RequestsTotal   *logfx.CounterMetric
	RequestDuration *logfx.HistogramMetric
}

// NewMetrics creates HTTP metrics using the clean logfx approach.
func NewMetrics(builder *logfx.MetricsBuilder) *Metrics {
	return &Metrics{
		builder: builder,

		RequestsTotal:   nil,
		RequestDuration: nil,
	}
}

func (metrics *Metrics) Init() error {
	requestsTotal, err := metrics.builder.Counter(
		"http_requests_total",
		"Total number of HTTP requests",
	).WithUnit("{request}").Build()
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToBuildHTTPRequestsCounter, err)
	}

	metrics.RequestsTotal = requestsTotal

	requestDuration, err := metrics.builder.Histogram(
		"http_request_duration_seconds",
		"HTTP request duration in seconds",
	).WithDurationBuckets().Build()
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToBuildHTTPRequestDurationHistogram, err)
	}

	metrics.RequestDuration = requestDuration

	return nil
}
