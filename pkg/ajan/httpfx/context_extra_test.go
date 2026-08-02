// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

func makeContextWithBody(t *testing.T, bodyJSON string) *httpfx.Context {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(bodyJSON))

	return &httpfx.Context{
		Request:        req,
		ResponseWriter: httptest.NewRecorder(),
		Results:        httpfx.Results{},
	}
}

func makeContextNilBody(t *testing.T) *httpfx.Context {
	t.Helper()

	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.Body = nil

	return &httpfx.Context{
		Request:        req,
		ResponseWriter: httptest.NewRecorder(),
		Results:        httpfx.Results{},
	}
}

func TestParseJSONBody_NilBody(t *testing.T) {
	t.Parallel()

	ctx := makeContextNilBody(t)

	var target map[string]string

	err := ctx.ParseJSONBody(&target)

	if !errors.Is(err, httpfx.ErrRequestBodyNil) {
		t.Errorf("expected ErrRequestBodyNil, got %v", err)
	}
}

func TestParseJSONBody_ValidJSON(t *testing.T) {
	t.Parallel()

	ctx := makeContextWithBody(t, `{"name":"alice"}`)

	var target map[string]string

	err := ctx.ParseJSONBody(&target)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if target["name"] != "alice" {
		t.Errorf("expected name alice, got %q", target["name"])
	}
}

func TestParseJSONBody_InvalidJSON(t *testing.T) {
	t.Parallel()

	ctx := makeContextWithBody(t, `not valid json`)

	var target map[string]string

	err := ctx.ParseJSONBody(&target)

	if !errors.Is(err, httpfx.ErrFailedToParseJSON) {
		t.Errorf("expected ErrFailedToParseJSON, got %v", err)
	}
}
