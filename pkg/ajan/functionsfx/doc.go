// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package functionsfx is the Go function model of the stack: handlers that do
// not know how they are invoked, adapters that bind them to triggers, a
// registry that names them, and errors with a kind that survives the bridge.
//
// It pairs feature by feature with @eserstack/functions (ADR 0011). A feature
// added on one side gets a counterpart on the other, or a recorded reason it
// has none; the table is in README.md and shared fixtures in
// testdata/conformance keep the two behaviors equal.
//
// A function is a Handler that has a name and a Descriptor:
//
//	greet, err := functionsfx.NewFunction("greet",
//	    functionsfx.Handler[string, string](
//	        func(_ context.Context, name string) (string, error) {
//	            return "Hello, " + name, nil
//	        }),
//	    functionsfx.WithInputSchema(json.RawMessage(`{"type":"string"}`)),
//	)
//
//	registry := functionsfx.NewRegistry()
//	err = registry.Register(greet)
//	out, err := registry.Call(ctx, "greet", json.RawMessage(`"Ada"`))
//
// Dependencies reach a handler through the constructor of the type that holds
// it, so there is no Reader parameter. Go calls Go only; TypeScript reaches a
// function through the bridge, which serves the registry by name.
package functionsfx
