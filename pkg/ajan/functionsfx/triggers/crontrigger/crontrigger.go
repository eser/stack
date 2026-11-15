// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package crontrigger binds a function to a workerfx worker (ADR 0011): each run
// of the worker is a triggers.CronEvent, and the error of the function is the
// error of the run.
//
//	worker := crontrigger.Worker("sweep", time.Hour, trigger)
//	runner := workerfx.NewRunner(worker, logger)
package crontrigger

import (
	"context"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
	"github.com/eser/stack/pkg/ajan/workerfx"
)

// Option sets one option of Worker.
type Option func(*cronWorker)

// WithClock replaces the clock that stamps the scheduled time of each run, which
// a test uses to give an event a time it can compare.
func WithClock(now func() time.Time) Option {
	return func(w *cronWorker) {
		if now != nil {
			w.now = now
		}
	}
}

type cronWorker struct {
	trigger  functionsfx.Trigger[triggers.CronEvent, error]
	now      func() time.Time
	name     string
	interval time.Duration
}

func (w *cronWorker) Name() string { return w.name }

func (w *cronWorker) Interval() time.Duration { return w.interval }

// Execute runs the function once, for the time the clock gives now.
func (w *cronWorker) Execute(ctx context.Context) error {
	return w.trigger(ctx, triggers.CronEvent{ScheduledTime: w.now(), Name: w.name})
}

// Worker makes a workerfx.Worker that runs the trigger every interval, an
// interval of zero meaning without a pause, as workerfx has it. The trigger's
// response is the error of the run, so a binding maps its output with
// triggers.ErrOf.
func Worker(name string, interval time.Duration, trigger functionsfx.Trigger[triggers.CronEvent, error], options ...Option) workerfx.Worker { //nolint:ireturn
	worker := &cronWorker{name: name, interval: interval, trigger: trigger, now: time.Now}

	for _, option := range options {
		option(worker)
	}

	return worker
}
