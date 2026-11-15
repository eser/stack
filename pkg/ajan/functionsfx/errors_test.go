// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/results"
)

func TestKindOf(t *testing.T) {
	t.Parallel()

	other := results.Define(results.ResultKindError, "NotFound", "not found")

	tests := []struct {
		err  error
		name string
		want functionsfx.Kind
	}{
		{nil, "nil", functionsfx.KindUnknown},
		{functionsfx.NewValidationError("bad"), "validation", functionsfx.KindValidation},
		{functionsfx.NewAbortError("stop"), "abort", functionsfx.KindAbort},
		{functionsfx.NewAdaptError("bad event", nil), "adapt", functionsfx.KindAdapt},
		{fmt.Errorf("call: %w", functionsfx.NewValidationError("bad")), "wrapped", functionsfx.KindValidation},
		{context.Canceled, "canceled context", functionsfx.KindAbort},
		{fmt.Errorf("call: %w", context.DeadlineExceeded), "wrapped deadline", functionsfx.KindAbort},
		{errors.New("plain"), "plain error", functionsfx.KindUnknown},
		{other.New(), "another coded result", functionsfx.Kind("NotFound")},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := functionsfx.KindOf(tc.err); got != tc.want {
				t.Errorf("KindOf(%v) = %q, want %q", tc.err, got, tc.want)
			}
		})
	}
}

func TestIsKind(t *testing.T) {
	t.Parallel()

	if !functionsfx.IsKind(functionsfx.NewAbortError("stop"), functionsfx.KindAbort) {
		t.Error("an abort error is not of kind abort")
	}

	if functionsfx.IsKind(nil, functionsfx.KindUnknown) {
		t.Error("nil is of a kind")
	}

	if functionsfx.IsKind(functionsfx.NewAbortError("stop"), functionsfx.KindValidation) {
		t.Error("an abort error is of kind validation")
	}
}

func TestMessageOf(t *testing.T) {
	t.Parallel()

	tests := []struct {
		err  error
		name string
		want string
	}{
		{nil, "nil", ""},
		{functionsfx.NewValidationError("Invalid email address"), "coded error", "Invalid email address"},
		{fmt.Errorf("call: %w", functionsfx.NewAdaptError("Method not allowed", nil)), "wrapped coded error", "Method not allowed"},
		{errors.New("plain"), "plain error", "plain"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := functionsfx.MessageOf(tc.err); got != tc.want {
				t.Errorf("MessageOf(%v) = %q, want %q", tc.err, got, tc.want)
			}
		})
	}
}

func TestAdaptErrorKeepsItsCause(t *testing.T) {
	t.Parallel()

	cause := errors.New("body is not JSON")
	err := functionsfx.NewAdaptError("Bad body", cause)

	if !errors.Is(err, cause) {
		t.Error("errors.Is does not reach the cause of an adapt error")
	}

	if got := functionsfx.MessageOf(err); got != "Bad body" {
		t.Errorf("MessageOf = %q, want %q", got, "Bad body")
	}
}

func TestToWire(t *testing.T) {
	t.Parallel()

	tests := []struct {
		err  error
		name string
		want string
	}{
		{functionsfx.NewValidationError("bad"), "kind survives", `{"error":"bad","errorKind":"ValidationError"}`},
		{context.Canceled, "context error", `{"error":"context canceled","errorKind":"AbortError"}`},
		{errors.New("plain"), "no kind", `{"error":"plain"}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			encoded, err := json.Marshal(functionsfx.ToWire(tc.err))
			if err != nil {
				t.Fatalf("Marshal: %v", err)
			}

			if string(encoded) != tc.want {
				t.Errorf("wire = %s, want %s", encoded, tc.want)
			}
		})
	}
}
