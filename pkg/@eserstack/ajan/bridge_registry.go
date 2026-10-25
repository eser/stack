// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// errUnknownFunction is the error for a dispatch name the registry does not
// hold: a typo, or a name whose domain this build leaves out (the WASM
// profile).
var errUnknownFunction = errors.New("unknown function")

// bridgeFunc is one entry of the dispatch registry: a bridge function that
// takes its arguments as strings, in the order params names them, and answers
// with a string (JSON for most functions).
type bridgeFunc struct {
	call   func(args []string) string
	params []string
}

// registry maps a dispatch name, such as "formatEncode", to its bridge
// function. Each domain file adds its names from init(), so a build that
// leaves a domain out, like the WASM profile, has none of that domain's names.
// The WASM reactor dispatches through it, and the native dispatcher ABI of
// TASK-238 will too.
var registry = map[string]bridgeFunc{} //nolint:gochecknoglobals

// register adds a dispatch name. A name registered twice is a programming
// error, caught at startup.
func register(name string, params []string, call func(args []string) string) {
	if _, dup := registry[name]; dup {
		panic("bridge registry: " + name + " is registered twice")
	}

	registry[name] = bridgeFunc{call: call, params: params}
}

// registeredNames returns every dispatch name of this build, sorted.
func registeredNames() []string {
	names := make([]string, 0, len(registry))
	for name := range registry {
		names = append(names, name)
	}

	sort.Strings(names)

	return names
}

// callRegistered runs the named bridge function. An unknown name, a wrong
// argument count and a JSON argument nested deeper than
// formatfx.MaxNestingDepth are errors, so a host cannot crash the bridge with
// any of them: decoding a deep request overflows the WASM host's stack, which
// recover cannot catch.
func callRegistered(name string, args []string) (string, error) {
	entry, ok := registry[name]
	if !ok {
		return "", fmt.Errorf("%w: %s", errUnknownFunction, name)
	}

	if len(args) != len(entry.params) {
		return "", fmt.Errorf(
			"%s takes %d argument(s) (%s), got %d",
			name, len(entry.params), strings.Join(entry.params, ", "), len(args),
		)
	}

	for i, arg := range args {
		if strings.HasPrefix(arg, "{") || strings.HasPrefix(arg, "[") {
			if err := formatfx.CheckJSONDepth(arg); err != nil {
				return "", fmt.Errorf("%s: %s: %w", name, entry.params[i], err)
			}
		}
	}

	return entry.call(args), nil
}

func init() {
	register("version", nil, func(_ []string) string { return bridgeVersion() })
	register("init", nil, func(_ []string) string {
		if bridgeInit() != 0 {
			return marshalError("init failed")
		}

		return "initialized"
	})
	register("shutdown", nil, func(_ []string) string {
		bridgeShutdown()

		return "shutdown"
	})
	register("diResolve", []string{"name"}, func(a []string) string { return bridgeDIResolve(a[0]) })
}
