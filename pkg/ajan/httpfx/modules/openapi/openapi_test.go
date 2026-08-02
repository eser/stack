// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package openapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/modules/openapi"
)

func TestRegisterHTTPRoutes_Disabled(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		OpenAPIEnabled: false,
	}
	openapi.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/openapi.json", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code == http.StatusOK {
		t.Error("route should not be registered when OpenAPIEnabled=false")
	}
}

func TestRegisterHTTPRoutes_Enabled(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		OpenAPIEnabled: true,
	}
	openapi.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/openapi.json", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200 from /openapi.json, got %d", rr.Code)
	}

	var resp map[string]any

	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("expected valid JSON: %v", err)
	}

	if resp["openapi"] != "3.0.0" {
		t.Errorf("expected openapi version 3.0.0, got %v", resp["openapi"])
	}
}

func TestRegisterHTTPRoutes_Enabled_WithRoutes(t *testing.T) {
	t.Parallel()

	router := httpfx.NewRouter("/")
	config := &httpfx.Config{ //nolint:exhaustruct
		OpenAPIEnabled: true,
	}

	router.Route("GET /ping", func(ctx *httpfx.Context) httpfx.Result {
		return ctx.Results.Ok()
	}).HasSummary("Ping").HasDescription("Health ping endpoint")

	openapi.RegisterHTTPRoutes(router, config)

	req := httptest.NewRequest(http.MethodGet, "/openapi.json", nil)
	rr := httptest.NewRecorder()
	router.GetMux().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}

	var resp map[string]any

	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("expected valid JSON: %v", err)
	}

	paths, ok := resp["paths"].(map[string]any)
	if !ok {
		t.Fatal("expected paths object in response")
	}

	if _, found := paths["/ping"]; !found {
		t.Error("expected /ping to appear in OpenAPI paths")
	}
}
