// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package formatfx

import (
	"errors"
	"fmt"
)

// Sentinel errors for wrapping with errors.Is.
var (
	ErrFormatNotFound  = errors.New("format not found")
	ErrSerialization   = errors.New("serialization failed")
	ErrDeserialization = errors.New("deserialization failed")
)

// FormatOptions configures serialization and deserialization behavior.
type FormatOptions struct {
	Pretty    bool
	Indent    int
	Separator string
	Headers   []string
	Delimiter rune
	Quote     rune
	Encoding  string
	// IsFirst signals that WriteItem is being called for the first array element,
	// allowing formats to suppress leading commas or separators.
	IsFirst bool
	Extra   map[string]any
}

// FormatReader reads items incrementally from chunks of text.
type FormatReader interface {
	Push(chunk string) ([]any, error)
	Flush() ([]any, error)
}

// Format describes a serialization format.
//
// Write methods (WriteStart / WriteItem / WriteEnd) produce text output.
// For formats without an array envelope (JSONL, CSV), WriteStart and WriteEnd
// return empty strings. The caller must pass IsFirst=true in FormatOptions for
// the first WriteItem call so that formats can suppress leading delimiters.
type Format interface {
	Name() string
	Extensions() []string
	Streamable() bool

	WriteStart(opts *FormatOptions) (string, error)
	WriteItem(data any, opts *FormatOptions) (string, error)
	WriteEnd(opts *FormatOptions) (string, error)

	CreateReader(opts *FormatOptions) FormatReader
}

// FormatRegistry maps names and file extensions to Format implementations.
type FormatRegistry interface {
	Register(format Format)
	Unregister(name string)
	Get(nameOrExtension string) (Format, bool)
	List() []Format
	Has(nameOrExtension string) bool
	Clear()
}

// FormatError is the base type for all format-related errors.
type FormatError struct {
	FormatName string
	Msg        string
	Err        error
}

func (e *FormatError) Error() string {
	if e.FormatName != "" {
		return fmt.Sprintf("[%s] %s", e.FormatName, e.Msg)
	}

	return e.Msg
}

func (e *FormatError) Unwrap() error { return e.Err }

// FormatNotFoundError is returned when a format name or extension is not registered.
type FormatNotFoundError struct {
	FormatError
}

func newFormatNotFound(name string) *FormatNotFoundError {
	return &FormatNotFoundError{
		FormatError: FormatError{
			FormatName: name,
			Msg:        fmt.Sprintf("format '%s' not found in registry", name),
			Err:        ErrFormatNotFound,
		},
	}
}

// SerializationError is returned when encoding data fails.
type SerializationError struct {
	FormatError
}

func newSerializationError(format, msg string, cause error) *SerializationError {
	return &SerializationError{
		FormatError: FormatError{
			FormatName: format,
			Msg:        msg,
			Err:        errors.Join(ErrSerialization, cause),
		},
	}
}

// DeserializationError is returned when decoding data fails.
type DeserializationError struct {
	FormatError
}

func newDeserializationError(format, msg string, cause error) *DeserializationError {
	return &DeserializationError{
		FormatError: FormatError{
			FormatName: format,
			Msg:        msg,
			Err:        errors.Join(ErrDeserialization, cause),
		},
	}
}
