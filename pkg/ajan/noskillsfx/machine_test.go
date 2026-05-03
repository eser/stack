// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx_test

import (
	"errors"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

func TestCanTransition(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		from     noskillsfx.Phase
		to       noskillsfx.Phase
		expected bool
	}{
		// valid forward transitions
		{"uninitialized→idle", noskillsfx.PhaseUninitialized, noskillsfx.PhaseIdle, true},
		{"idle→discovery", noskillsfx.PhaseIdle, noskillsfx.PhaseDiscovery, true},
		{"idle→completed", noskillsfx.PhaseIdle, noskillsfx.PhaseCompleted, true},
		{"discovery→refinement", noskillsfx.PhaseDiscovery, noskillsfx.PhaseDiscoveryRefinement, true},
		{"discovery→completed", noskillsfx.PhaseDiscovery, noskillsfx.PhaseCompleted, true},
		{"refinement→proposal", noskillsfx.PhaseDiscoveryRefinement, noskillsfx.PhaseSpecProposal, true},
		{"refinement→self", noskillsfx.PhaseDiscoveryRefinement, noskillsfx.PhaseDiscoveryRefinement, true},
		{"proposal→approved", noskillsfx.PhaseSpecProposal, noskillsfx.PhaseSpecApproved, true},
		{"approved→executing", noskillsfx.PhaseSpecApproved, noskillsfx.PhaseExecuting, true},
		{"executing→completed", noskillsfx.PhaseExecuting, noskillsfx.PhaseCompleted, true},
		{"executing→blocked", noskillsfx.PhaseExecuting, noskillsfx.PhaseBlocked, true},
		{"blocked→executing", noskillsfx.PhaseBlocked, noskillsfx.PhaseExecuting, true},
		{"completed→idle", noskillsfx.PhaseCompleted, noskillsfx.PhaseIdle, true},
		{"completed→discovery", noskillsfx.PhaseCompleted, noskillsfx.PhaseDiscovery, true},
		// invalid transitions
		{"idle→executing", noskillsfx.PhaseIdle, noskillsfx.PhaseExecuting, false},
		{"discovery→executing", noskillsfx.PhaseDiscovery, noskillsfx.PhaseExecuting, false},
		{"uninitialized→executing", noskillsfx.PhaseUninitialized, noskillsfx.PhaseExecuting, false},
		{"blocked→idle", noskillsfx.PhaseBlocked, noskillsfx.PhaseIdle, false},
		{"unknown phase", "unknown", noskillsfx.PhaseIdle, false},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := noskillsfx.CanTransition(tc.from, tc.to)
			if got != tc.expected {
				t.Errorf("CanTransition(%q, %q) = %v, want %v", tc.from, tc.to, got, tc.expected)
			}
		})
	}
}

func TestAssertTransition(t *testing.T) {
	t.Parallel()

	t.Run("valid transition returns nil", func(t *testing.T) {
		t.Parallel()
		err := noskillsfx.AssertTransition(noskillsfx.PhaseIdle, noskillsfx.PhaseDiscovery)
		if err != nil {
			t.Errorf("expected nil, got %v", err)
		}
	})

	t.Run("invalid transition returns ErrInvalidTransition", func(t *testing.T) {
		t.Parallel()
		err := noskillsfx.AssertTransition(noskillsfx.PhaseIdle, noskillsfx.PhaseExecuting)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
		if !errors.Is(err, noskillsfx.ErrInvalidTransition) {
			t.Errorf("expected ErrInvalidTransition, got %v", err)
		}
	})
}

func TestStartSpec(t *testing.T) {
	t.Parallel()

	t.Run("transitions IDLE→DISCOVERY and sets fields", func(t *testing.T) {
		t.Parallel()
		state := noskillsfx.CreateInitialState()
		desc := "add auth feature"
		got, err := noskillsfx.StartSpec(state, "add-auth", "main", &desc)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got.Phase != noskillsfx.PhaseDiscovery {
			t.Errorf("phase = %q, want %q", got.Phase, noskillsfx.PhaseDiscovery)
		}
		if got.Spec == nil || *got.Spec != "add-auth" {
			t.Errorf("spec = %v, want %q", got.Spec, "add-auth")
		}
	})

	t.Run("rejects transition from DISCOVERY", func(t *testing.T) {
		t.Parallel()
		state := noskillsfx.CreateInitialState()
		state.Phase = noskillsfx.PhaseDiscovery
		_, err := noskillsfx.StartSpec(state, "another", "main", nil)
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})
}

func TestAdvanceExecution(t *testing.T) {
	t.Parallel()

	state := noskillsfx.CreateInitialState()
	state.Phase = noskillsfx.PhaseExecuting
	got := noskillsfx.AdvanceExecution(state, "step done")

	if got.Execution.Iteration != 1 {
		t.Errorf("iteration = %d, want 1", got.Execution.Iteration)
	}
	if got.Execution.LastProgress == nil || *got.Execution.LastProgress != "step done" {
		t.Errorf("lastProgress = %v, want %q", got.Execution.LastProgress, "step done")
	}
	if got.Execution.AwaitingStatusReport {
		t.Error("awaitingStatusReport should be false after advance")
	}
}
