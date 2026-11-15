// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"context"
	"errors"

	"github.com/eser/stack/pkg/ajan/results"
)

// Kind names the class of a function error. It is the code of the
// results.Definition the error carries, so it crosses the bridge as text and
// TypeScript reads it as the _tag of its error.
type Kind string

const (
	// KindUnknown is the kind of an error that carries no code.
	KindUnknown Kind = ""
	// KindValidation marks input that a function refused.
	KindValidation Kind = "ValidationError"
	// KindAbort marks work that was cancelled or timed out.
	KindAbort Kind = "AbortError"
	// KindAdapt marks a trigger event that could not become handler input.
	KindAdapt Kind = "AdaptError"
)

var (
	validationDefinition = results.Define(results.ResultKindError, string(KindValidation), "validation failed")
	abortDefinition      = results.Define(results.ResultKindError, string(KindAbort), "aborted")
	adaptDefinition      = results.Define(results.ResultKindError, string(KindAdapt), "adapt failed")
)

// detail is the cause inside a function error: its text is the message of
// the error and cause is what Unwrap reaches.
type detail struct {
	cause   error
	message string
}

func (d *detail) Error() string { return d.message }

func (d *detail) Unwrap() error { return d.cause }

// NewValidationError returns the error of input a function refused. It pairs
// with ValidationError in @eserstack/functions.
func NewValidationError(message string) error {
	return validationDefinition.Wrap(&detail{message: message, cause: nil})
}

// NewAbortError returns the error of work that was cancelled. It pairs with
// AbortError in @eserstack/functions.
func NewAbortError(message string) error {
	return abortDefinition.Wrap(&detail{message: message, cause: nil})
}

// NewAdaptError returns the error of a trigger event that could not become
// handler input. cause may be nil; when it is set, errors.Is and errors.AsType
// reach it. It pairs with AdaptError in @eserstack/functions.
func NewAdaptError(message string, cause error) error {
	return adaptDefinition.Wrap(&detail{message: message, cause: cause})
}

// KindOf answers the kind of err: the code of the results.Result it carries,
// KindAbort for a cancelled or timed out context, and KindUnknown for any
// other error and for nil.
func KindOf(err error) Kind {
	if err == nil {
		return KindUnknown
	}

	if result, ok := errors.AsType[results.Result](err); ok && result.Definition != nil {
		return Kind(result.Definition.Code)
	}

	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return KindAbort
	}

	return KindUnknown
}

// IsKind reports whether err is of the given kind.
func IsKind(err error, kind Kind) bool {
	return err != nil && KindOf(err) == kind
}

// MessageOf answers the message of err: the text of the cause inside the
// results.Result it carries, so a function error reads the same on both sides
// of the bridge, and the text of err otherwise. It answers "" for nil.
func MessageOf(err error) string {
	if err == nil {
		return ""
	}

	if result, ok := errors.AsType[results.Result](err); ok && result.InnerError != nil {
		return result.InnerError.Error()
	}

	return err.Error()
}

// WireError is how a function error crosses the bridge. Its field names follow
// the error answers of the bridge: an object with an "error" string fails the
// dispatcher envelope, and "errorKind" rides along in its result.
type WireError struct {
	Message string `json:"error"`
	Kind    Kind   `json:"errorKind,omitempty"`
}

// ToWire turns err into its wire form. It answers the zero value for nil.
func ToWire(err error) WireError {
	return WireError{Message: MessageOf(err), Kind: KindOf(err)}
}
