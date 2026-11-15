// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package crontrigger_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers/crontrigger"
	"github.com/eser/stack/pkg/ajan/workerfx"
)

func TestTheWorkerRunsTheFunctionWithTheScheduledTime(t *testing.T) {
	t.Parallel()

	at := time.Date(2026, 11, 14, 3, 0, 0, 0, time.UTC)

	var seen triggers.CronEvent

	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[triggers.CronEvent, error, triggers.CronEvent, string]{
		Handler: func(_ context.Context, event triggers.CronEvent) (string, error) {
			seen = event

			return "swept", nil
		},
		AdaptInput:  func(event triggers.CronEvent) (triggers.CronEvent, error) { return event, nil },
		AdaptOutput: triggers.ErrOf[string],
	})
	if err != nil {
		t.Fatal(err)
	}

	worker := crontrigger.Worker("sweep", time.Hour, trigger, crontrigger.WithClock(func() time.Time { return at }))

	if worker.Name() != "sweep" || worker.Interval() != time.Hour {
		t.Errorf("worker = %q every %v", worker.Name(), worker.Interval())
	}

	if err := worker.Execute(t.Context()); err != nil {
		t.Fatalf("Execute: %v", err)
	}

	if seen.Name != "sweep" || !seen.ScheduledTime.Equal(at) {
		t.Errorf("event = %+v, want the name and the time of the clock", seen)
	}
}

func TestTheErrorOfTheFunctionIsTheErrorOfTheRun(t *testing.T) {
	t.Parallel()

	failure := errors.New("disk full") //nolint:err113

	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[triggers.CronEvent, error, struct{}, string]{
		Handler:     func(context.Context, struct{}) (string, error) { return "", failure },
		AdaptInput:  func(triggers.CronEvent) (struct{}, error) { return struct{}{}, nil },
		AdaptOutput: triggers.ErrOf[string],
	})
	if err != nil {
		t.Fatal(err)
	}

	if err := crontrigger.Worker("sweep", 0, trigger).Execute(t.Context()); !errors.Is(err, failure) {
		t.Errorf("Execute = %v, want the failure of the function", err)
	}
}

func TestTheWorkerIsAWorkerfxWorker(t *testing.T) {
	t.Parallel()

	var runs int

	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[triggers.CronEvent, error, struct{}, struct{}]{
		Handler: func(context.Context, struct{}) (struct{}, error) {
			runs++

			return struct{}{}, nil
		},
		AdaptInput:  func(triggers.CronEvent) (struct{}, error) { return struct{}{}, nil },
		AdaptOutput: triggers.ErrOf[struct{}],
	})
	if err != nil {
		t.Fatal(err)
	}

	// Worker answers a workerfx.Worker, so a workerfx runner takes it as it is.
	worker := crontrigger.Worker("tick", time.Hour, trigger)
	runner := workerfx.NewRunner(worker, nil)

	if runner == nil {
		t.Fatal("workerfx did not make a runner of the worker")
	}

	if err := worker.Execute(t.Context()); err != nil || runs != 1 {
		t.Errorf("Execute = %v after %d runs", err, runs)
	}
}
