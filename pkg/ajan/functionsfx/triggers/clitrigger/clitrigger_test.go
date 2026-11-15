// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package clitrigger_test

import (
	"context"
	"errors"
	"flag"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers/clitrigger"
)

func invocation(t *testing.T) *clifx.Context {
	t.Helper()

	flags := flag.NewFlagSet("greet", flag.ContinueOnError)
	flags.String("lang", "en", "language")
	flags.Bool("shout", false, "shout")
	flags.Int("times", 1, "times")
	flags.String("unused", "x", "never set")

	if err := flags.Parse([]string{"--lang", "tr", "--shout", "--times", "3", "Ada"}); err != nil {
		t.Fatal(err)
	}

	return &clifx.Context{ //nolint:exhaustruct
		Context: context.Background(),
		Path:    []string{"eser", "greet"},
		Args:    flags.Args(),
		Flags:   flags,
	}
}

func TestEventReadsTheInvocation(t *testing.T) {
	t.Parallel()

	event := clitrigger.Event(invocation(t))

	if event.Command != "greet" || len(event.Args) != 1 || event.Args[0] != "Ada" {
		t.Errorf("event = %+v", event)
	}

	if event.Flags["lang"] != "tr" || event.Flags["shout"] != true || event.Flags["times"] != 3 {
		t.Errorf("flags = %v, want the typed values of the flags that were set", event.Flags)
	}

	if _, present := event.Flags["unused"]; present {
		t.Error("a flag that was not set is in the event")
	}
}

func TestEventJoinsTheWordsOfTheCommand(t *testing.T) {
	t.Parallel()

	flags := flag.NewFlagSet("x", flag.ContinueOnError)

	event := clitrigger.Event(&clifx.Context{Context: context.Background(), Path: []string{"eser", "codebase", "validate"}, Flags: flags}) //nolint:exhaustruct

	if event.Command != "codebase validate" || len(event.Flags) != 0 {
		t.Errorf("event = %+v", event)
	}
}

func TestEventOfACommandWithoutAPathUsesItsName(t *testing.T) {
	t.Parallel()

	event := clitrigger.Event(&clifx.Context{Context: context.Background(), Command: &clifx.Command{Name: "solo"}}) //nolint:exhaustruct

	if event.Command != "solo" || event.Args == nil {
		t.Errorf("event = %+v", event)
	}
}

func TestExitMapsTheKindToTheExitCode(t *testing.T) {
	t.Parallel()

	if err := clitrigger.Exit("out", nil); err != nil {
		t.Errorf("Exit of a success = %v, want nil", err)
	}

	for name, err := range map[string]error{
		"validation": functionsfx.NewValidationError("bad input"),
		"adapt":      functionsfx.NewAdaptError("bad event", nil),
	} {
		exit, ok := errors.AsType[*clifx.ExitError](clitrigger.Exit("", err))
		if !ok || exit.Code != clifx.ExitUsage || !errors.Is(exit, clifx.ErrUsage) {
			t.Errorf("%s: exit = %v, want a usage error with code %d", name, exit, clifx.ExitUsage)
		}
	}

	for name, err := range map[string]error{
		"plain": errors.New("disk full"), //nolint:err113
		"abort": functionsfx.NewAbortError("stop"),
	} {
		exit, ok := errors.AsType[*clifx.ExitError](clitrigger.Exit("", err))
		if !ok || exit.Code != clifx.ExitFailure || errors.Is(exit, clifx.ErrUsage) {
			t.Errorf("%s: exit = %v, want a failure with code %d", name, exit, clifx.ExitFailure)
		}
	}
}

func TestRunRunsTheFunctionOfACommand(t *testing.T) {
	t.Parallel()

	var greeted string

	trigger, err := functionsfx.NewTrigger(functionsfx.TriggerBinding[triggers.CLIEvent, error, string, string]{
		Handler: func(_ context.Context, name string) (string, error) {
			if name == "" {
				return "", functionsfx.NewValidationError("a name is required")
			}

			greeted = "Hello, " + name

			return greeted, nil
		},
		AdaptInput: func(event triggers.CLIEvent) (string, error) {
			if len(event.Args) == 0 {
				return "", nil
			}

			return event.Args[0], nil
		},
		AdaptOutput: clitrigger.Exit[string],
	})
	if err != nil {
		t.Fatal(err)
	}

	run := clitrigger.Run(trigger)

	if err := run(invocation(t)); err != nil || greeted != "Hello, Ada" {
		t.Errorf("Run = %v, greeted %q", err, greeted)
	}

	empty := &clifx.Context{Context: context.Background(), Path: []string{"eser", "greet"}} //nolint:exhaustruct

	err = run(empty)
	if exit, ok := errors.AsType[*clifx.ExitError](err); !ok || exit.Code != clifx.ExitUsage || !strings.Contains(exit.Error(), "a name is required") {
		t.Errorf("Run without a name = %v, want a usage error that says so", err)
	}
}
