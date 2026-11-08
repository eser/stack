// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package jsonparser

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/tailscale/hujson"
)

// ErrSyntax is the error every Document and DocumentWithComments failure
// matches.
var ErrSyntax = errors.New("syntax error")

// Document checks that text holds one JSON value and returns it as written.
// The value is not decoded into Go maps, so a reader that keeps the order of
// object keys, such as JavaScript's JSON.parse, gets the keys in the order of
// the text. An error names the line and the byte column.
func Document(text string) (json.RawMessage, error) {
	data := []byte(text)

	var raw json.RawMessage

	err := json.Unmarshal(data, &raw)
	if err == nil {
		return raw, nil
	}

	offset := len(data)

	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		offset = max(int(syntaxErr.Offset)-1, 0)
		if strings.Contains(syntaxErr.Error(), "unexpected end of JSON input") {
			offset = len(data)
		}
	}

	line, column := lineColumn(data, offset)

	return nil, fmt.Errorf("%w: line %d, column %d: %s", ErrSyntax, line, column, err.Error())
}

// DocumentWithComments reads JSONC, JSON with // and /* */ comments and
// trailing commas, and returns it as standard JSON with the keys in the
// order of the text. Comments and trailing commas become spaces, so an error
// names the line and the byte column of the text as written.
func DocumentWithComments(text string) (json.RawMessage, error) {
	standard, err := hujson.Standardize([]byte(text))
	if err != nil {
		return nil, fmt.Errorf("%w: %s", ErrSyntax, strings.TrimPrefix(err.Error(), "hujson: "))
	}

	return Document(string(standard))
}

// lineColumn is the 1-based line and byte column of offset in data.
func lineColumn(data []byte, offset int) (int, int) {
	before := data[:min(offset, len(data))]
	line := 1 + bytes.Count(before, []byte("\n"))
	column := 1 + len(before) - (bytes.LastIndexByte(before, '\n') + 1)

	return line, column
}
