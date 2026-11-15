// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package clitrigger binds a function to a clifx command (ADR 0011): the words,
// arguments and flags of the invocation become a triggers.CLIEvent, and the
// error of the function becomes the exit of the command.
//
//	command := &clifx.Command{Name: "greet", Run: clitrigger.Run(trigger)}
package clitrigger

import (
	"flag"
	"fmt"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/functionsfx"
	"github.com/eser/stack/pkg/ajan/functionsfx/triggers"
)

// Event reads a command invocation as a triggers.CLIEvent. The command is its
// words after the name of the program, joined by spaces, and the flags are the
// ones that were set, by their typed values where the flag has one.
func Event(c *clifx.Context) triggers.CLIEvent {
	command := ""

	switch {
	case len(c.Path) > 1:
		command = strings.Join(c.Path[1:], " ")
	case c.Command != nil:
		command = c.Command.Name
	}

	flags := map[string]any{}

	if c.Flags != nil {
		c.Flags.Visit(func(set *flag.Flag) {
			if getter, ok := set.Value.(flag.Getter); ok {
				flags[set.Name] = getter.Get()

				return
			}

			flags[set.Name] = set.Value.String()
		})
	}

	return triggers.CLIEvent{Command: command, Args: append([]string{}, c.Args...), Flags: flags}
}

// Exit is a ResponseMapper for a command: it drops the output and turns the error
// into the one clifx exits with. Input the function refused (a ValidationError
// or an AdaptError) is a usage error, which clifx prints with the usage of the
// command and exits 2 for; any other error exits 1.
func Exit[O any](_ O, err error) error {
	if err == nil {
		return nil
	}

	switch functionsfx.KindOf(err) {
	case functionsfx.KindValidation, functionsfx.KindAdapt:
		return &clifx.ExitError{Code: clifx.ExitUsage, Err: fmt.Errorf("%w: %s", clifx.ErrUsage, functionsfx.MessageOf(err))}
	case functionsfx.KindAbort, functionsfx.KindUnknown:
		return &clifx.ExitError{Code: clifx.ExitFailure, Err: err}
	default:
		return &clifx.ExitError{Code: clifx.ExitFailure, Err: err}
	}
}

// Run makes the Run function of a command of a trigger. The trigger's response
// is the error the command returns, so a binding maps its output with Exit or
// triggers.ErrOf.
func Run(trigger functionsfx.Trigger[triggers.CLIEvent, error]) func(c *clifx.Context) error {
	return func(c *clifx.Context) error {
		return trigger(c, Event(c))
	}
}
