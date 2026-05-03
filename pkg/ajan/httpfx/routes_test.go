// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"net/http"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

func newTestRoute(t *testing.T) *httpfx.Route {
	t.Helper()

	router := httpfx.NewRouter("/")

	return router.Route("GET /test-route", func(c *httpfx.Context) httpfx.Result {
		return c.Results.Ok()
	})
}

func TestRouteParameterType_String(t *testing.T) {
	t.Parallel()

	tests := []struct {
		param httpfx.RouteParameterType
		want  string
	}{
		{httpfx.RouteParameterTypeHeader, "Header"},
		{httpfx.RouteParameterTypeQuery, "Query"},
		{httpfx.RouteParameterTypePath, "Path"},
		{httpfx.RouteParameterTypeBody, "Body"},
		{httpfx.RouteParameterType(99), "RouteParameterType(99)"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			t.Parallel()

			if got := tt.param.String(); got != tt.want {
				t.Errorf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestRoute_HasOperationID(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	got := route.HasOperationID("op-123")

	if got != route {
		t.Error("expected HasOperationID to return the same route")
	}

	if route.Spec.OperationID != "op-123" {
		t.Errorf("expected OperationID op-123, got %q", route.Spec.OperationID)
	}
}

func TestRoute_HasSummary(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.HasSummary("My summary")

	if route.Spec.Summary != "My summary" {
		t.Errorf("expected Summary 'My summary', got %q", route.Spec.Summary)
	}
}

func TestRoute_HasDescription(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.HasDescription("desc text")

	if route.Spec.Description != "desc text" {
		t.Errorf("expected Description 'desc text', got %q", route.Spec.Description)
	}
}

func TestRoute_HasTags(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.HasTags("api", "v1")

	if len(route.Spec.Tags) != 2 {
		t.Fatalf("expected 2 tags, got %d", len(route.Spec.Tags))
	}

	if route.Spec.Tags[0] != "api" || route.Spec.Tags[1] != "v1" {
		t.Errorf("unexpected tags: %v", route.Spec.Tags)
	}
}

func TestRoute_IsDeprecated(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.IsDeprecated()

	if !route.Spec.Deprecated {
		t.Error("expected Deprecated=true")
	}
}

func TestRoute_HasPathParameter(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.HasPathParameter("id", "User ID")

	if len(route.Parameters) != 1 {
		t.Fatalf("expected 1 parameter, got %d", len(route.Parameters))
	}

	p := route.Parameters[0]

	if p.Name != "id" {
		t.Errorf("expected name id, got %q", p.Name)
	}

	if p.Type != httpfx.RouteParameterTypePath {
		t.Errorf("expected RouteParameterTypePath, got %v", p.Type)
	}

	if !p.IsRequired {
		t.Error("path parameter should be required")
	}
}

func TestRoute_HasQueryParameter(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.HasQueryParameter("q", "Search query")

	if len(route.Parameters) != 1 {
		t.Fatalf("expected 1 parameter, got %d", len(route.Parameters))
	}

	p := route.Parameters[0]

	if p.Type != httpfx.RouteParameterTypeQuery {
		t.Errorf("expected RouteParameterTypeQuery, got %v", p.Type)
	}
}

func TestRoute_HasRequestModel(t *testing.T) {
	t.Parallel()

	type RequestBody struct{ Name string }
	route := newTestRoute(t)
	route.HasRequestModel(RequestBody{})

	if len(route.Spec.Requests) != 1 {
		t.Fatalf("expected 1 request model, got %d", len(route.Spec.Requests))
	}
}

func TestRoute_HasResponse(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.HasResponse(http.StatusOK)

	if len(route.Spec.Responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(route.Spec.Responses))
	}

	if route.Spec.Responses[0].StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", route.Spec.Responses[0].StatusCode)
	}

	if route.Spec.Responses[0].HasModel {
		t.Error("HasResponse should not set HasModel")
	}
}

func TestRoute_HasResponseModel(t *testing.T) {
	t.Parallel()

	type ResponseBody struct{ ID int }
	route := newTestRoute(t)
	route.HasResponseModel(http.StatusOK, ResponseBody{})

	if len(route.Spec.Responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(route.Spec.Responses))
	}

	if !route.Spec.Responses[0].HasModel {
		t.Error("HasResponseModel should set HasModel=true")
	}
}

func TestRoute_Freeze_IsFrozen(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)

	if route.IsFrozen() {
		t.Error("new route should not be frozen")
	}

	route.Freeze()

	if !route.IsFrozen() {
		t.Error("route should be frozen after Freeze()")
	}
}

func TestRoute_Frozen_PanicOnModify(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)
	route.Freeze()

	defer func() {
		if r := recover(); r == nil {
			t.Error("expected panic when modifying frozen route")
		}
	}()

	route.HasSummary("should panic")
}

func TestRoute_FluentChaining(t *testing.T) {
	t.Parallel()

	route := newTestRoute(t)

	// Verify all setters chain correctly.
	returned := route.
		HasOperationID("chain-op").
		HasSummary("chain summary").
		HasDescription("chain desc").
		HasTags("tag1").
		HasPathParameter("id", "path id").
		HasQueryParameter("q", "query param").
		HasRequestModel(struct{ X int }{}).
		HasResponse(http.StatusCreated).
		HasResponseModel(http.StatusOK, struct{ Y string }{}).
		IsDeprecated()

	if returned != route {
		t.Error("fluent chain should return the same *Route")
	}
}
