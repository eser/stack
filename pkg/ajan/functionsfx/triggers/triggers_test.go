// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package triggers_test

import (
	"context"
	"errors"
	"testing"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
)

type order struct {
	Customer string `json:"customerId"`
	Quantity int    `json:"quantity"`
}

func TestAConvertsADecodedValueToTheInputType(t *testing.T) {
	t.Parallel()

	got, err := triggers.As[order](map[string]any{"customerId": "cust-1", "quantity": float64(3)})
	if err != nil || got != (order{Customer: "cust-1", Quantity: 3}) {
		t.Errorf("As = (%+v, %v)", got, err)
	}
}

func TestAValueThatDoesNotFitIsAnAdaptError(t *testing.T) {
	t.Parallel()

	for name, value := range map[string]any{
		"a string for a number": map[string]any{"customerId": "c", "quantity": "many"},
		"a list for an object":  []any{1, 2},
		"a value JSON cannot":   make(chan int),
	} {
		if _, err := triggers.As[order](value); !functionsfx.IsKind(err, functionsfx.KindAdapt) {
			t.Errorf("%s: error = %v, want an AdaptError", name, err)
		}
	}
}

func TestStatusOfFollowsTheKindOfTheError(t *testing.T) {
	t.Parallel()

	tests := []struct {
		err  error
		name string
		want int
	}{
		{functionsfx.NewValidationError("bad"), "validation", 400},
		{functionsfx.NewAdaptError("bad event", nil), "adapt", 400},
		{functionsfx.NewAbortError("stop"), "abort", 503},
		{context.DeadlineExceeded, "deadline", 503},
		{errors.New("disk full"), "plain", 500}, //nolint:err113
		{nil, "nil", 500},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := triggers.StatusOf(tc.err); got != tc.want {
				t.Errorf("StatusOf(%v) = %d, want %d", tc.err, got, tc.want)
			}
		})
	}
}

func TestErrOfGivesTheErrorAndDropsTheOutput(t *testing.T) {
	t.Parallel()

	failure := errors.New("no") //nolint:err113

	if got := triggers.ErrOf("output", failure); !errors.Is(got, failure) {
		t.Errorf("ErrOf = %v", got)
	}

	if got := triggers.ErrOf("output", nil); got != nil {
		t.Errorf("ErrOf = %v, want nil", got)
	}
}
