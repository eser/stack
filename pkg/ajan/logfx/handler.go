package logfx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/log"
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

type Handler struct {
	InitError error

	InnerHandler slog.Handler

	InnerWriter io.Writer
	InnerConfig *Config

	ScopeName string

	// Subscribers receive every handled record after it is written. The
	// record they get carries the attributes added with WithAttrs and the
	// groups opened with WithGroup, flattened to dotted keys (http.status).
	Subscribers []func(ctx context.Context, rec slog.Record) error

	// groupPrefix holds the names of the groups opened with WithGroup, each
	// followed by a dot, such as "http.request.".
	groupPrefix string

	// attrs holds the attributes added with WithAttrs, flattened and keyed
	// with the group prefix that was open when they were added. InnerHandler
	// keeps its own copy for the JSON output; pretty mode and the
	// subscribers read this one.
	attrs []slog.Attr
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

		// ParseLevel returns a nil *slog.Level on error, and that nil pointer
		// inside the Leveler interface panics on the first Enabled call. Fall
		// back to Info; NewLogger reports InitError once the logger exists.
		level = LevelInfo
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

// PrettifyMessage renders rec as colored text: the time, the level and the
// message on the first line, then one "key = value" line per attribute. The
// attributes added with WithAttrs come before the record's own, and each key
// is prefixed with the groups it belongs to, joined by dots (http.status).
func (h *Handler) PrettifyMessage(rec slog.Record) string { //nolint:gocritic // hugeParam: slog.Record is passed by value, as slog.Handler does
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

	for _, attr := range h.qualifiedAttrs(rec) {
		keyLen := min(len(attr.Key), PrettyModeKeyMaxLength)

		out.WriteRune('\n')
		out.WriteRune('\t')
		out.WriteString(attr.Key)
		out.WriteString(strings.Repeat(" ", PrettyModeKeyMaxLength-keyLen))
		out.WriteRune('=')
		out.WriteRune(' ')

		out.WriteString(attr.Value.String())
	}

	out.WriteRune('\n')
	out.WriteRune('\n')

	return out.String()
}

func (h *Handler) Handle(ctx context.Context, rec slog.Record) error { //nolint:gocritic // hugeParam: slog.Record is passed by value, as slog.Handler does
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

	if len(h.Subscribers) == 0 {
		return nil
	}

	flatRec := slog.NewRecord(rec.Time, rec.Level, rec.Message, rec.PC)
	flatRec.AddAttrs(h.qualifiedAttrs(rec)...)

	for _, subscriber := range h.Subscribers {
		err := subscriber(ctx, flatRec)
		if err != nil {
			return fmt.Errorf("%w: %w", ErrFailedToHandleLog, err)
		}
	}

	return nil
}

// WithAttrs returns a handler that adds attrs to every record it handles,
// in the JSON output, in pretty mode and in what the subscribers receive.
func (h *Handler) WithAttrs(attrs []slog.Attr) slog.Handler {
	if len(attrs) == 0 {
		return h
	}

	derived := h.derive(h.InnerHandler.WithAttrs(attrs))
	// Clip forces append to copy, so handlers derived from the same parent
	// never write into each other's attributes.
	derived.attrs = appendQualifiedAttrs(slices.Clip(h.attrs), h.groupPrefix, attrs)

	return derived
}

// WithGroup returns a handler that nests the attributes added after it under
// name. An empty name returns the handler unchanged, as slog.Handler asks.
func (h *Handler) WithGroup(name string) slog.Handler {
	if name == "" {
		return h
	}

	derived := h.derive(h.InnerHandler.WithGroup(name))
	derived.groupPrefix = h.groupPrefix + name + "."

	return derived
}

// derive copies h around a new inner handler; WithAttrs and WithGroup then
// change the field they own.
func (h *Handler) derive(innerHandler slog.Handler) *Handler {
	return &Handler{
		InitError: h.InitError,

		InnerHandler: innerHandler,

		InnerWriter: h.InnerWriter,
		InnerConfig: h.InnerConfig,
		Subscribers: h.Subscribers,

		ScopeName: h.ScopeName,

		groupPrefix: h.groupPrefix,
		attrs:       h.attrs,
	}
}

// qualifiedAttrs returns the attributes added with WithAttrs followed by the
// attributes of rec, flattened and keyed with their group prefixes.
func (h *Handler) qualifiedAttrs(rec slog.Record) []slog.Attr { //nolint:gocritic // hugeParam: slog.Record is passed by value, as slog.Handler does
	result := make([]slog.Attr, 0, len(h.attrs)+rec.NumAttrs())
	result = append(result, h.attrs...)

	rec.Attrs(func(attr slog.Attr) bool {
		result = appendQualifiedAttrs(result, h.groupPrefix, []slog.Attr{attr})

		return true
	})

	return result
}

// appendQualifiedAttrs appends attrs to dst with prefix in front of each key.
// It follows the slog.Handler rules: values are resolved, an attribute with
// an empty key and a zero value is dropped, a group is flattened into its
// members with its key added to the prefix (an empty key inlines them), and
// an empty group is dropped.
func appendQualifiedAttrs(dst []slog.Attr, prefix string, attrs []slog.Attr) []slog.Attr {
	for _, attr := range attrs {
		value := attr.Value.Resolve()

		if value.Kind() == slog.KindGroup {
			memberPrefix := prefix
			if attr.Key != "" {
				memberPrefix += attr.Key + "."
			}

			dst = appendQualifiedAttrs(dst, memberPrefix, value.Group())

			continue
		}

		if attr.Key == "" && value.Kind() == slog.KindAny && value.Any() == nil {
			continue
		}

		dst = append(dst, slog.Attr{Key: prefix + attr.Key, Value: value})
	}

	return dst
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
//
// The attribute types come from go.opentelemetry.io/otel/attribute rather
// than otel/log: log v0.21.0 removed its own KeyValue and constructors, and
// Record.AddAttributes/SetBody take the attribute package's types now.
func ConvertSlogAttrsToOtelLog(attrs []any) []attribute.KeyValue {
	logAttrs := make([]attribute.KeyValue, len(attrs))

	for i, attr := range attrs {
		slogAttr, slogAttrOk := attr.(slog.Attr)

		if !slogAttrOk {
			continue
		}

		logAttrs[i] = *ConvertSlogAttrToOtelLog(slogAttr)
	}

	return logAttrs
}

// ConvertSlogAttrToOtelLog converts a single slog.Attr to OpenTelemetry attribute.KeyValue.
func ConvertSlogAttrToOtelLog(attr slog.Attr) *attribute.KeyValue {
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

// isOTLPErrorLog checks if this is an OTLP error log to prevent recursion.
func (h *Handler) isOTLPErrorLog(rec slog.Record) bool { //nolint:gocritic // hugeParam: slog.Record is passed by value, as slog.Handler does
	// Check if this log record is about OTLP export errors
	return strings.Contains(rec.Message, "OTLP log export failed")
}

func (h *Handler) convertSlogRecordToOtelLog( //nolint:cyclop
	rec slog.Record, //nolint:gocritic // hugeParam: slog.Record is passed by value, as slog.Handler does
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
	logAttrs := make([]attribute.KeyValue, slogAttrsLen+1)

	scopeName := h.ScopeName

	for i, attr := range slogAttrs {
		logAttrs[i] = *ConvertSlogAttrToOtelLog(attr)

		if attr.Key == "scope_name" && attr.Value.Kind() == slog.KindString {
			scopeName = attr.Value.String()
		}
	}

	logRecord.AddAttributes(logAttrs[:slogAttrsLen]...)

	logAttrs[slogAttrsLen] = attribute.KeyValue{
		Key:   "msg",
		Value: attribute.StringValue(rec.Message),
	}

	logRecord.SetBody(attribute.MapValue(logAttrs...))

	return scopeName, &logRecord
}
