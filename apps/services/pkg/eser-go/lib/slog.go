package lib

import (
	"log/slog"
	"strings"
)

func SerializeSlogAttrs(attrs []slog.Attr) string {
	var b strings.Builder //nolint:varnamelen

	for i, attr := range attrs {
		if i > 0 {
			b.WriteString(", ")
		}

		b.WriteString(attr.String())
	}

	return b.String()
}

func GetSlogAttrs(rec slog.Record) []slog.Attr {
	attrs := make([]slog.Attr, 0)

	rec.Attrs(func(attr slog.Attr) bool {
		attrs = append(attrs, attr)

		return true
	})

	return attrs
}
