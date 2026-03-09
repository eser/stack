package results

import (
	"log/slog"
	"strings"

	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
)

type Result struct { //nolint:errname
	Definition *Definition

	InnerError      error
	InnerPayload    any
	InnerAttributes []slog.Attr
}

func (r Result) Error() string {
	return r.String()
}

func (r Result) Unwrap() error {
	return r.InnerError
}

func (r Result) IsSuccess() bool {
	return r.Definition.Kind == ResultKindSuccess
}

func (r Result) IsError() bool {
	return r.Definition.Kind == ResultKindError
}

func (r Result) String() string {
	attrs := r.Attributes()

	builder := strings.Builder{}
	builder.WriteRune('[')
	builder.WriteString(r.Definition.Code)
	builder.WriteString("] ")
	builder.WriteString(r.Definition.Message)

	if len(attrs) > 0 {
		builder.WriteString(" (")
		builder.WriteString(lib.SerializeSlogAttrs(attrs))
		builder.WriteRune(')')
	}

	if r.InnerError != nil {
		builder.WriteString(": ")
		builder.WriteString(r.InnerError.Error())
	}

	return builder.String()
}

func (r Result) Attributes() []slog.Attr {
	attrs := r.Definition.Attributes

	// if r.InnerPayload != nil {
	// 	attrs = append(attrs, slog.Any("payload", r.InnerPayload))
	// }

	return append(attrs, r.InnerAttributes...)
}

func (r Result) WithError(err error) Result {
	r.InnerError = err

	return r
}

func (r Result) WithAttribute(attributes ...slog.Attr) Result {
	r.InnerAttributes = append(r.InnerAttributes, attributes...)

	return r
}
