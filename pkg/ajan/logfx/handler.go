package logfx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/trace"
)

const (
	// 38 is the max length of the time string + level string + space including color codes.
	PrettyModeMessageStartIndex = 38

	// 25 is the max length of the key string.
	PrettyModeKeyMaxLength = 25
)

var (
	ErrFailedToParseLogLevel = errors.New("failed to parse log level")
	ErrFailedToWriteLog      = errors.New("failed to write log")
	ErrFailedToHandleLog     = errors.New("failed to handle log")
)

// OTLPLogExporter defines the interface for OTLP log export capability.
type OTLPLogExporter interface {
	GetLoggerProvider() *sdklog.LoggerProvider
}

type Handler struct {
	InitError error

	InnerHandler slog.Handler

	InnerWriter io.Writer
	InnerConfig *Config

	ScopeName string

	Subscribers []func(ctx context.Context, rec slog.Record) error
}

var _ slog.Handler = (*Handler)(nil)

func NewHandler(scopeName string, w io.Writer, config *Config) *Handler {
	var initError error

	var level slog.Leveler

	level, err := ParseLevel(config.Level, false)
	if err != nil {
		initError = fmt.Errorf(
			"%w (level=%q): %w",
			ErrFailedToParseLogLevel,
			config.Level,
			err,
		)

		// FIXME(@eser) on error, explicitly set to zero value of slog.Level which is Info
		level = slog.Level(0)
	}

	opts := &slog.HandlerOptions{
		Level:       level,
		ReplaceAttr: ReplacerGenerator(config.PrettyMode),
		AddSource:   config.AddSource,
	}

	innerHandler := slog.NewJSONHandler(w, opts)

	return &Handler{
		InitError: initError,

		InnerHandler: innerHandler,
		InnerWriter:  w,
		InnerConfig:  config,

		Subscribers: []func(ctx context.Context, rec slog.Record) error{},

		ScopeName: scopeName,
	}
}

func (h *Handler) AddSubscriber(subscriber func(ctx context.Context, rec slog.Record) error) {
	h.Subscribers = append(h.Subscribers, subscriber)
}

func (h *Handler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.InnerHandler.Enabled(ctx, level)
}

func (h *Handler) AddAdditionalAttributes(ctx context.Context, rec *slog.Record) {
	span := trace.SpanFromContext(ctx)

	spanCtx := span.SpanContext()

	if spanCtx.IsValid() {
		rec.AddAttrs(
			slog.String("trace_id", spanCtx.TraceID().String()),
			slog.String("span_id", spanCtx.SpanID().String()),
		)
	}
}

func (h *Handler) PrettifyMessage(rec slog.Record) string {
	out := strings.Builder{}

	timeStr := rec.Time.Format("15:04:05.000")

	out.WriteString(Colored(ColorDimGray, timeStr))
	out.WriteRune(' ')

	out.WriteString(LevelEncoderColored(rec.Level))

	currentLength := out.Len()
	if currentLength < PrettyModeMessageStartIndex {
		out.WriteString(strings.Repeat(" ", PrettyModeMessageStartIndex-currentLength))
	}

	out.WriteRune(' ')
	out.WriteString(rec.Message)

	rec.Attrs(func(attr slog.Attr) bool {
		keyLen := min(len(attr.Key), PrettyModeKeyMaxLength)

		out.WriteRune('\n')
		out.WriteRune('\t')
		out.WriteString(attr.Key)
		out.WriteString(strings.Repeat(" ", PrettyModeKeyMaxLength-keyLen))
		out.WriteRune('=')
		out.WriteRune(' ')

		out.WriteString(attr.Value.String())

		return true
	})

	out.WriteRune('\n')
	out.WriteRune('\n')

	return out.String()
}

func (h *Handler) Handle(ctx context.Context, rec slog.Record) error {
	h.AddAdditionalAttributes(ctx, &rec)

	var err error

	if h.InnerConfig.PrettyMode {
		out := h.PrettifyMessage(rec)

		_, err = io.WriteString(h.InnerWriter, out)
	} else {
		err = h.InnerHandler.Handle(ctx, rec)
	}

	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToWriteLog, err)
	}

	for _, subscriber := range h.Subscribers {
		err := subscriber(ctx, rec)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToHandleLog, err)
		}
	}

	return nil
}

func (h *Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &Handler{
		InitError: h.InitError,

		InnerHandler: h.InnerHandler.WithAttrs(attrs),

		InnerWriter: h.InnerWriter,
		InnerConfig: h.InnerConfig,
		Subscribers: h.Subscribers,

		ScopeName: h.ScopeName,
	}
}

func (h *Handler) WithGroup(name string) slog.Handler {
	return &Handler{
		InitError: h.InitError,

		InnerHandler: h.InnerHandler.WithGroup(name),

		InnerWriter: h.InnerWriter,
		InnerConfig: h.InnerConfig,
		Subscribers: h.Subscribers,

		ScopeName: h.ScopeName,
	}
}

// enableOTLPExport adds OTLP log export capability to the handler.
func (h *Handler) enableOTLPExport(loggerProvider log.LoggerProvider) {
	// Create OTLP log export subscriber
	otlpSubscriber := func(ctx context.Context, rec slog.Record) error {
		// Skip OTLP export for OTLP error logs to prevent recursion
		if h.isOTLPErrorLog(rec) {
			return nil
		}

		scopeName, logRecord := h.convertSlogRecordToOtelLog(rec)

		logger := loggerProvider.Logger(scopeName)

		// Fire-and-forget OTLP export
		logger.Emit(ctx, *logRecord)

		return nil
	}

	// Add the subscriber to the handler
	h.Subscribers = append(h.Subscribers, otlpSubscriber)
}

// ConvertSlogAttrsToOtelAttr converts slog attributes to OpenTelemetry attributes.
func ConvertSlogAttrsToOtelAttr(attrs []any) []attribute.KeyValue {
	logAttrs := make([]attribute.KeyValue, len(attrs))

	for i, attr := range attrs {
		slogAttr, slogAttrOk := attr.(slog.Attr)

		if !slogAttrOk {
			continue
		}

		logAttrs[i] = *ConvertSlogAttrToOtelAttr(slogAttr)
	}

	return logAttrs
}

// slogAttrParts extracts the typed components of a slog.Attr based on its Kind.
// Returns (stringVal, int64Val, float64Val, boolVal, kind) for the caller to construct
// the appropriate target type. This avoids code duplication between OTel attribute and log converters.
func slogAttrParts(value slog.Value) (string, int64, float64, bool) { //nolint:cyclop
	switch value.Kind() {
	case slog.KindString:
		return value.String(), 0, 0, false
	case slog.KindInt64:
		return "", value.Int64(), 0, false
	case slog.KindFloat64:
		return "", 0, value.Float64(), false
	case slog.KindBool:
		return "", 0, 0, value.Bool()
	case slog.KindTime:
		return value.Time().Format(time.RFC3339Nano), 0, 0, false
	case slog.KindUint64:
		if value.Uint64() > math.MaxInt64 {
			return value.String(), 0, 0, false
		}

		return "", int64(value.Uint64()), 0, false
	case slog.KindDuration:
		return value.Duration().String(), 0, 0, false
	case slog.KindAny, slog.KindGroup, slog.KindLogValuer:
		return value.String(), 0, 0, false
	default:
		return value.String(), 0, 0, false
	}
}

// ConvertSlogAttrToOtelAttr converts a single slog.Attr to OpenTelemetry attribute.KeyValue.
func ConvertSlogAttrToOtelAttr(attr slog.Attr) *attribute.KeyValue {
	key := attr.Key
	value := attr.Value
	strVal, intVal, floatVal, boolVal := slogAttrParts(value)

	var keyValue attribute.KeyValue

	switch value.Kind() { //nolint:exhaustive
	case slog.KindInt64:
		keyValue = attribute.Int64(key, intVal)
	case slog.KindFloat64:
		keyValue = attribute.Float64(key, floatVal)
	case slog.KindBool:
		keyValue = attribute.Bool(key, boolVal)
	case slog.KindUint64:
		if value.Uint64() > math.MaxInt64 {
			keyValue = attribute.String(key, strVal)
		} else {
			keyValue = attribute.Int64(key, intVal)
		}
	default:
		keyValue = attribute.String(key, strVal)
	}

	return &keyValue
}

// ConvertSlogAttrsToOtelLog converts slog attributes to OpenTelemetry attributes.
func ConvertSlogAttrsToOtelLog(attrs []any) []log.KeyValue {
	logAttrs := make([]log.KeyValue, len(attrs))

	for i, attr := range attrs {
		slogAttr, slogAttrOk := attr.(slog.Attr)

		if !slogAttrOk {
			continue
		}

		logAttrs[i] = *ConvertSlogAttrToOtelLog(slogAttr)
	}

	return logAttrs
}

// ConvertSlogAttrToOtelLog converts a single slog.Attr to OpenTelemetry log.KeyValue.
func ConvertSlogAttrToOtelLog(attr slog.Attr) *log.KeyValue {
	key := attr.Key
	value := attr.Value
	strVal, intVal, floatVal, boolVal := slogAttrParts(value)

	var keyValue log.KeyValue

	switch value.Kind() { //nolint:exhaustive
	case slog.KindInt64:
		keyValue = log.Int64(key, intVal)
	case slog.KindFloat64:
		keyValue = log.Float64(key, floatVal)
	case slog.KindBool:
		keyValue = log.Bool(key, boolVal)
	case slog.KindUint64:
		if value.Uint64() > math.MaxInt64 {
			keyValue = log.String(key, strVal)
		} else {
			keyValue = log.Int64(key, intVal)
		}
	default:
		keyValue = log.String(key, strVal)
	}

	return &keyValue
}

// isOTLPErrorLog checks if this is an OTLP error log to prevent recursion.
func (h *Handler) isOTLPErrorLog(rec slog.Record) bool {
	// Check if this log record is about OTLP export errors
	return strings.Contains(rec.Message, "OTLP log export failed")
}

func (h *Handler) convertSlogRecordToOtelLog( //nolint:cyclop
	rec slog.Record,
) (string, *log.Record) {
	// Create OpenTelemetry log record
	var logRecord log.Record

	// Set timestamp
	logRecord.SetTimestamp(rec.Time)

	// Set severity text and level
	logRecord.SetSeverityText(rec.Level.String())

	// Map slog levels to OpenTelemetry severity numbers
	switch {
	case rec.Level < LevelDebug:
		logRecord.SetSeverity(log.SeverityTrace)
	case rec.Level < LevelInfo:
		logRecord.SetSeverity(log.SeverityDebug)
	case rec.Level < LevelWarn:
		logRecord.SetSeverity(log.SeverityInfo)
	case rec.Level < LevelError:
		logRecord.SetSeverity(log.SeverityWarn)
	case rec.Level < LevelFatal:
		logRecord.SetSeverity(log.SeverityError)
	case rec.Level < LevelPanic:
		logRecord.SetSeverity(log.SeverityFatal)
	default:
		logRecord.SetSeverity(log.SeverityFatal)
	}

	// Get slog attributes
	slogAttrs := lib.GetSlogAttrs(rec)
	slogAttrsLen := len(slogAttrs)

	// Set message body with structured attributes preserved
	logAttrs := make([]log.KeyValue, slogAttrsLen+1)

	scopeName := h.ScopeName

	for i, attr := range slogAttrs {
		logAttrs[i] = *ConvertSlogAttrToOtelLog(attr)

		if attr.Key == "scope_name" && attr.Value.Kind() == slog.KindString {
			scopeName = attr.Value.String()
		}
	}

	logRecord.AddAttributes(logAttrs[:slogAttrsLen]...)

	logAttrs[slogAttrsLen] = log.KeyValue{
		Key:   "msg",
		Value: log.StringValue(rec.Message),
	}

	logRecord.SetBody(log.MapValue(logAttrs...))

	return scopeName, &logRecord
}
