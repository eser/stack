// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package logfx

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

// FormatterFunc converts a slog.Record to a formatted string.
type FormatterFunc func(rec slog.Record) string

// JSONFormatter returns a FormatterFunc that serializes records as a JSON line.
func JSONFormatter() FormatterFunc {
	return func(rec slog.Record) string {
		m := map[string]any{
			"time":  rec.Time.Format(time.RFC3339Nano),
			"level": LevelEncoder(rec.Level),
			"msg":   rec.Message,
		}

		rec.Attrs(func(a slog.Attr) bool {
			m[a.Key] = a.Value.Any()

			return true
		})

		b, _ := json.Marshal(m) //nolint:errchkjson

		return string(b)
	}
}

// TextFormatter returns a FormatterFunc that serializes records as key=value pairs.
func TextFormatter() FormatterFunc {
	return func(rec slog.Record) string {
		var buf bytes.Buffer

		fmt.Fprintf(&buf, "time=%s level=%s msg=%q",
			rec.Time.Format(time.RFC3339),
			LevelEncoder(rec.Level),
			rec.Message,
		)

		rec.Attrs(func(a slog.Attr) bool {
			fmt.Fprintf(&buf, " %s=%v", a.Key, a.Value.Any())

			return true
		})

		return buf.String()
	}
}

// SpanFormatter wraps an inner FormatterFunc and appends trace_id/span_id when present.
func SpanFormatter(inner FormatterFunc) FormatterFunc {
	return func(rec slog.Record) string {
		var traceID, spanID string

		rec.Attrs(func(a slog.Attr) bool {
			switch a.Key {
			case "trace_id":
				traceID = a.Value.String()
			case "span_id":
				spanID = a.Value.String()
			}

			return true
		})

		base := inner(rec)

		if traceID != "" {
			return fmt.Sprintf("%s trace_id=%s span_id=%s", base, traceID, spanID)
		}

		return base
	}
}
