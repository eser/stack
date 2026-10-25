// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1 || eserajan_wasi

package main

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"sync"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// ---------------------------------------------------------------------------
// Format wire types (camelCase for TypeScript consumers)
// ---------------------------------------------------------------------------

type formatEncodeRequest struct {
	Data    json.RawMessage `json:"data"`
	Format  string          `json:"format"`
	Pretty  bool            `json:"pretty"`
	Indent  int             `json:"indent"`
	IsFirst bool            `json:"isFirst"`
	// Document marks data as a whole document rather than one list entry.
	Document bool `json:"document"`
}

type formatEncodeResponse struct {
	Result string `json:"result"`
	Error  string `json:"error,omitempty"`
}

type formatEncodeDocumentRequest struct {
	Format string            `json:"format"`
	Items  []json.RawMessage `json:"items"`
	Pretty bool              `json:"pretty"`
	Indent int               `json:"indent"`
}

type formatEncodeDocumentResponse struct {
	Result string `json:"result"`
	Error  string `json:"error,omitempty"`
}

type formatDecodeRequest struct {
	Format  string   `json:"format"`
	Text    string   `json:"text"`
	Headers []string `json:"headers,omitempty"`
}

type formatDecodeResponse struct {
	Items []json.RawMessage `json:"items"`
	Error string            `json:"error,omitempty"`
}

type formatInfo struct {
	Name       string   `json:"name"`
	Extensions []string `json:"extensions"`
	Streamable bool     `json:"streamable"`
}

type formatListResponse struct {
	Formats []formatInfo `json:"formats"`
	Error   string       `json:"error,omitempty"`
}

// ---------------------------------------------------------------------------
// Format bridge functions
// ---------------------------------------------------------------------------

// initFormats ensures the built-in formats are registered. Idempotent.
var formatOnce sync.Once

// trailingDocSep matches a trailing YAML (---) or TOML (+++) document separator.
var trailingDocSep = regexp.MustCompile(`\n(---|\+\+\+)\n$`)

func ensureFormats() {
	formatOnce.Do(formatfx.RegisterBuiltinFormats)
}

// bridgeFormatEncode serializes the given data value to the named format.
// The data field must be a valid JSON value; it is unmarshalled before
// being passed to the format's WriteItem method. With document set, the value
// is written as one whole document: one YAML mapping, one TOML table without a
// "+++" line, or one JSON value without array separators.
func bridgeFormatEncode(requestJSON string) string {
	var req formatEncodeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(formatEncodeResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	ensureFormats()

	f, err := formatfx.GetFormat(req.Format)
	if err != nil {
		return marshalResponse(formatEncodeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	var data any
	if err := json.Unmarshal(req.Data, &data); err != nil {
		return marshalResponse(formatEncodeResponse{Error: "invalid data JSON: " + err.Error()}) //nolint:exhaustruct
	}

	opts := &formatfx.FormatOptions{ //nolint:exhaustruct
		Pretty:   req.Pretty,
		Indent:   req.Indent,
		IsFirst:  req.IsFirst,
		Document: req.Document,
	}

	result, err := f.WriteItem(data, opts)
	if err != nil {
		return marshalResponse(formatEncodeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(formatEncodeResponse{Result: result, Error: ""})
}

// bridgeFormatEncodeDocument serializes all items to the named format as a
// single document, invoking WriteStart / WriteItem (per item) / WriteEnd.
// The caller passes items as a JSON array; each element is unmarshalled before
// being handed to the format's WriteItem method. IsFirst is set automatically
// for the first item. A trailing YAML/TOML document separator (---/+++) is
// trimmed from the output to match the behaviour of the TypeScript serializer.
func bridgeFormatEncodeDocument(requestJSON string) string {
	var req formatEncodeDocumentRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	ensureFormats()

	f, err := formatfx.GetFormat(req.Format)
	if err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	baseOpts := &formatfx.FormatOptions{Pretty: req.Pretty, Indent: req.Indent} //nolint:exhaustruct

	var chunks []string

	start, err := f.WriteStart(baseOpts)
	if err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: "writeStart: " + err.Error()}) //nolint:exhaustruct
	}

	if start != "" {
		chunks = append(chunks, start)
	}

	for i, raw := range req.Items {
		var item any
		if err := json.Unmarshal(raw, &item); err != nil {
			return marshalResponse(formatEncodeDocumentResponse{Error: fmt.Sprintf("invalid item[%d] JSON: %s", i, err.Error())}) //nolint:exhaustruct
		}

		itemOpts := &formatfx.FormatOptions{ //nolint:exhaustruct
			Pretty:  req.Pretty,
			Indent:  req.Indent,
			IsFirst: i == 0,
		}

		encoded, err := f.WriteItem(item, itemOpts)
		if err != nil {
			return marshalResponse(formatEncodeDocumentResponse{Error: fmt.Sprintf("writeItem[%d]: %s", i, err.Error())}) //nolint:exhaustruct
		}

		chunks = append(chunks, encoded)
	}

	end, err := f.WriteEnd(baseOpts)
	if err != nil {
		return marshalResponse(formatEncodeDocumentResponse{Error: "writeEnd: " + err.Error()}) //nolint:exhaustruct
	}

	if end != "" {
		chunks = append(chunks, end)
	}

	result := strings.Join(chunks, "")

	// Mirror the TypeScript serializer's trimTrailingSeparator: strip a trailing
	// YAML (---) or TOML (+++) document separator followed by a newline.
	result = trailingDocSep.ReplaceAllString(result, "\n")

	return marshalResponse(formatEncodeDocumentResponse{Result: result}) //nolint:exhaustruct
}

// bridgeFormatDecode parses text in the named format and returns all items as
// a JSON array. Each item is marshalled to a JSON value independently.
func bridgeFormatDecode(requestJSON string) string {
	var req formatDecodeRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(formatDecodeResponse{Error: fmt.Errorf("invalid request JSON: %w", err).Error()}) //nolint:exhaustruct
	}

	ensureFormats()

	f, err := formatfx.GetFormat(req.Format)
	if err != nil {
		return marshalResponse(formatDecodeResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	var readerOpts *formatfx.FormatOptions
	if len(req.Headers) > 0 {
		readerOpts = &formatfx.FormatOptions{Headers: req.Headers} //nolint:exhaustruct
	}

	reader := f.CreateReader(readerOpts)

	pushed, err := reader.Push(req.Text)
	if err != nil {
		return marshalResponse(formatDecodeResponse{Error: "parse failed: " + err.Error()}) //nolint:exhaustruct
	}

	flushed, err := reader.Flush()
	if err != nil {
		return marshalResponse(formatDecodeResponse{Error: "flush failed: " + err.Error()}) //nolint:exhaustruct
	}

	all := make([]any, 0, len(pushed)+len(flushed))
	all = append(all, pushed...)
	all = append(all, flushed...)

	rawItems := make([]json.RawMessage, 0, len(all))

	for _, item := range all {
		raw, err := json.Marshal(item)
		if err != nil {
			return marshalResponse(formatDecodeResponse{Error: "marshal item: " + err.Error()}) //nolint:exhaustruct
		}

		rawItems = append(rawItems, raw)
	}

	return marshalResponse(formatDecodeResponse{Items: rawItems, Error: ""})
}

// bridgeFormatList returns metadata for all registered built-in formats.
func bridgeFormatList() string {
	ensureFormats()

	formats := formatfx.DefaultRegistry.List()
	infos := make([]formatInfo, 0, len(formats))

	for _, f := range formats {
		infos = append(infos, formatInfo{
			Name:       f.Name(),
			Extensions: f.Extensions(),
			Streamable: f.Streamable(),
		})
	}

	return marshalResponse(formatListResponse{Formats: infos, Error: ""})
}

func init() {
	register("formatEncode", []string{"requestJSON"}, func(a []string) string { return bridgeFormatEncode(a[0]) })
	register("formatDecode", []string{"requestJSON"}, func(a []string) string { return bridgeFormatDecode(a[0]) })
	register("formatList", nil, func(_ []string) string { return bridgeFormatList() })
	register("formatEncodeDocument", []string{"requestJSON"}, func(a []string) string { return bridgeFormatEncodeDocument(a[0]) })
}
