package results

import (
	"log/slog"
)

type Definition struct {
	Code    string
	Message string

	Attributes []slog.Attr
	Kind       ResultKind
}

func Define(kind ResultKind, code string, message string, attributes ...slog.Attr) *Definition {
	if attributes == nil {
		attributes = make([]slog.Attr, 0)
	}

	return &Definition{
		Kind: kind,

		Code:    code,
		Message: message,

		Attributes: attributes,
	}
}

func (r *Definition) New(payload ...any) Result {
	return Result{
		Definition: r,

		InnerError:      nil,
		InnerPayload:    payload,
		InnerAttributes: make([]slog.Attr, 0),
	}
}

func (r *Definition) Wrap(err error, payload ...any) Result {
	return Result{
		Definition: r,

		InnerError:      err,
		InnerPayload:    payload,
		InnerAttributes: make([]slog.Attr, 0),
	}
}
