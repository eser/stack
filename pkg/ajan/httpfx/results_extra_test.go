// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

func TestWithErrorMessage(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	result := results.Ok(httpfx.WithErrorMessage("something went wrong"))

	var payload map[string]string

	err := json.Unmarshal(result.Body(), &payload)
	if err != nil {
		t.Fatalf("expected JSON body, got unmarshal error: %v", err)
	}

	if payload["error"] != "something went wrong" {
		t.Errorf("expected error field 'something went wrong', got %q", payload["error"])
	}
}

func TestWithJSON_Option_ValidData(t *testing.T) {
	t.Parallel()

	type payload struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}

	results := &httpfx.Results{}
	result := results.Ok(httpfx.WithJSON(payload{ID: 1, Name: "test"}))

	var decoded payload

	err := json.Unmarshal(result.Body(), &decoded)
	if err != nil {
		t.Fatalf("expected valid JSON, got: %v", err)
	}

	if decoded.ID != 1 || decoded.Name != "test" {
		t.Errorf("unexpected decoded value: %+v", decoded)
	}
}

func TestWithJSON_Option_MarshalError(t *testing.T) {
	t.Parallel()

	// Functions are not JSON-serializable — triggers the marshal error branch.
	results := &httpfx.Results{}
	result := results.Ok(httpfx.WithJSON(func() {}))

	if result.StatusCode() != http.StatusInternalServerError {
		t.Errorf("expected 500 on marshal error, got %d", result.StatusCode())
	}
}

func TestResults_JSON_MarshalError(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	result := results.JSON(func() {}) // un-marshalable

	if result.StatusCode() != http.StatusInternalServerError {
		t.Errorf("expected 500 on marshal error, got %d", result.StatusCode())
	}
}

func TestSetDiscloseErrors(t *testing.T) {
	// Not parallel — modifies package-level state.
	t.Cleanup(func() { httpfx.SetDiscloseErrors(false) })

	httpfx.SetDiscloseErrors(true)
	// Just verify the call doesn't panic; behavior verified in WithSanitizedError tests.
}

func TestWithSanitizedError_DiscloseDisabled(t *testing.T) {
	// Not parallel — reads package-level discloseErrors (default false).
	results := &httpfx.Results{}
	err := errors.New("secret internal details")
	result := results.Ok(httpfx.WithSanitizedError(err))

	var payload map[string]string

	if unmarshalErr := json.Unmarshal(result.Body(), &payload); unmarshalErr != nil {
		t.Fatalf("expected JSON body, got: %v", unmarshalErr)
	}

	if payload["error"] == "secret internal details" {
		t.Error("should not disclose real error when discloseErrors=false")
	}

	if payload["error"] == "" {
		t.Error("expected a generic error message, got empty")
	}
}

func TestWithSanitizedError_DiscloseEnabled(t *testing.T) {
	// Not parallel — modifies package-level state.
	httpfx.SetDiscloseErrors(true)
	t.Cleanup(func() { httpfx.SetDiscloseErrors(false) })

	results := &httpfx.Results{}
	err := errors.New("real error message")
	result := results.Ok(httpfx.WithSanitizedError(err))

	var payload map[string]string

	if unmarshalErr := json.Unmarshal(result.Body(), &payload); unmarshalErr != nil {
		t.Fatalf("expected JSON body, got: %v", unmarshalErr)
	}

	if payload["error"] != "real error message" {
		t.Errorf("expected real error, got %q", payload["error"])
	}
}
