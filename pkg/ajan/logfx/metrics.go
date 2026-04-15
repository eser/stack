package logfx

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.opentelemetry.io/otel/metric"
)

var (
	ErrFailedToCreateCounter   = errors.New("failed to create counter")
	ErrFailedToCreateGauge     = errors.New("failed to create gauge")
	ErrFailedToCreateHistogram = errors.New("failed to create histogram")
)

// MetricsBuilder provides a fluent interface for creating and managing metrics.
type MetricsBuilder struct {
	meter metric.Meter

	counters   map[string]metric.Int64Counter
	gauges     map[string]metric.Int64Gauge
	histograms map[string]metric.Float64Histogram
	name       string
}

func NewMetricsBuilder(meterProvider metric.MeterProvider, name string) *MetricsBuilder {
	return &MetricsBuilder{
		meter: meterProvider.Meter(name),

		counters:   make(map[string]metric.Int64Counter),
		gauges:     make(map[string]metric.Int64Gauge),
		histograms: make(map[string]metric.Float64Histogram),

		name: name,
	}
}

func (mb *MetricsBuilder) Bind(meterProvider metric.MeterProvider) {
	mb.meter = meterProvider.Meter(mb.name)
}

// Counter creates a new counter metric.
func (mb *MetricsBuilder) Counter(name, description string) *CounterBuilder {
	return &CounterBuilder{
		builder:     mb,
		name:        name,
		description: description,
		unit:        "1", // default unit
	}
}

// Gauge creates a new gauge metric.
func (mb *MetricsBuilder) Gauge(name, description string) *GaugeBuilder {
	return &GaugeBuilder{
		builder:     mb,
		name:        name,
		description: description,
		unit:        "1", // default unit
	}
}

// Histogram creates a new histogram metric.
func (mb *MetricsBuilder) Histogram(name, description string) *HistogramBuilder {
	return &HistogramBuilder{
		builder:     mb,
		name:        name,
		description: description,
		unit:        "s", // default unit for duration
		buckets:     nil, // explicitly initialize
	}
}

// CounterBuilder provides a fluent interface for building counter metrics.
type CounterBuilder struct {
	builder     *MetricsBuilder
	name        string
	description string
	unit        string
}

// WithUnit sets the unit for the counter.
func (cb *CounterBuilder) WithUnit(unit string) *CounterBuilder {
	cb.unit = unit

	return cb
}

// Build creates the counter metric and returns a CounterMetric wrapper.
func (cb *CounterBuilder) Build() (*CounterMetric, error) {
	counter, err := cb.builder.meter.Int64Counter(
		cb.name,
		metric.WithDescription(cb.description),
		metric.WithUnit(cb.unit),
	)
	if err != nil {
		return nil, fmt.Errorf("%w (cb_name=%q): %w", ErrFailedToCreateCounter, cb.name, err)
	}

	cb.builder.counters[cb.name] = counter

	return &CounterMetric{counter: counter}, nil
}

// GaugeBuilder provides a fluent interface for building gauge metrics.
type GaugeBuilder struct {
	builder     *MetricsBuilder
	name        string
	description string
	unit        string
}

// WithUnit sets the unit for the gauge.
func (gb *GaugeBuilder) WithUnit(unit string) *GaugeBuilder {
	gb.unit = unit

	return gb
}

// Build creates the gauge metric and returns a GaugeMetric wrapper.
func (gb *GaugeBuilder) Build() (*GaugeMetric, error) {
	gauge, err := gb.builder.meter.Int64Gauge(
		gb.name,
		metric.WithDescription(gb.description),
		metric.WithUnit(gb.unit),
	)
	if err != nil {
		return nil, fmt.Errorf("%w (gb_name=%q): %w", ErrFailedToCreateGauge, gb.name, err)
	}

	gb.builder.gauges[gb.name] = gauge

	return &GaugeMetric{gauge: gauge}, nil
}

// HistogramBuilder provides a fluent interface for building histogram metrics.
type HistogramBuilder struct {
	builder     *MetricsBuilder
	name        string
	description string
	unit        string
	buckets     []float64
}

// WithUnit sets the unit for the histogram.
func (hb *HistogramBuilder) WithUnit(unit string) *HistogramBuilder {
	hb.unit = unit

	return hb
}

// WithBuckets sets custom bucket boundaries for the histogram.
func (hb *HistogramBuilder) WithBuckets(buckets ...float64) *HistogramBuilder {
	hb.buckets = buckets

	return hb
}

// WithDurationBuckets sets predefined duration buckets for the histogram.
func (hb *HistogramBuilder) WithDurationBuckets() *HistogramBuilder {
	hb.buckets = []float64{
		0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
	}

	return hb
}

// Build creates the histogram metric and returns a HistogramMetric wrapper.
func (hb *HistogramBuilder) Build() (*HistogramMetric, error) {
	opts := []metric.Float64HistogramOption{
		metric.WithDescription(hb.description),
		metric.WithUnit(hb.unit),
	}

	if len(hb.buckets) > 0 {
		opts = append(opts, metric.WithExplicitBucketBoundaries(hb.buckets...))
	}

	histogram, err := hb.builder.meter.Float64Histogram(hb.name, opts...)
	if err != nil {
		return nil, fmt.Errorf("%w (hb_name=%q): %w", ErrFailedToCreateHistogram, hb.name, err)
	}

	hb.builder.histograms[hb.name] = histogram

	return &HistogramMetric{histogram: histogram}, nil
}

// CounterMetric wraps a counter with convenient methods.
type CounterMetric struct {
	counter metric.Int64Counter
}

// Add increments the counter by the given value with optional attributes.
func (cm *CounterMetric) Add(ctx context.Context, value int64, attrs ...any) {
	cm.counter.Add(ctx, value, metric.WithAttributes(ConvertSlogAttrsToOtelAttr(attrs)...))
}

// Inc increments the counter by 1 with optional attributes.
func (cm *CounterMetric) Inc(ctx context.Context, attrs ...any) {
	cm.Add(ctx, 1, attrs...)
}

// GaugeMetric wraps a gauge with convenient methods.
type GaugeMetric struct {
	gauge metric.Int64Gauge
}

// Set sets the gauge value with optional attributes.
func (gm *GaugeMetric) Set(ctx context.Context, value int64, attrs ...any) {
	gm.gauge.Record(ctx, value, metric.WithAttributes(ConvertSlogAttrsToOtelAttr(attrs)...))
}

// SetBool sets the gauge to 1 for true, 0 for false with optional attributes.
func (gm *GaugeMetric) SetBool(ctx context.Context, value bool, attrs ...any) {
	var intValue int64
	if value {
		intValue = 1
	}

	gm.Set(ctx, intValue, attrs...)
}

// HistogramMetric wraps a histogram with convenient methods.
type HistogramMetric struct {
	histogram metric.Float64Histogram
}

// Record records a value in the histogram with optional attributes.
func (hm *HistogramMetric) Record(ctx context.Context, value float64, attrs ...any) {
	hm.histogram.Record(ctx, value, metric.WithAttributes(ConvertSlogAttrsToOtelAttr(attrs)...))
}

// RecordDuration records a duration in seconds with optional attributes.
func (hm *HistogramMetric) RecordDuration(
	ctx context.Context,
	duration time.Duration,
	attrs ...any,
) {
	hm.Record(ctx, duration.Seconds(), attrs...)
}
