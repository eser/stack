// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package nativefx is the catalog of the functions the native bridge serves
// (ADR 0011). The bridge registers them when the library loads, and the type
// generator (`eser codebase native-types`) reads the same list, so what
// TypeScript is given types for is what the bridge serves.
//
// A package that exposes functions adds its registration to Register. Each
// function names its owner package with functionsfx.WithOwner, and the types
// are generated into that package.
package nativefx

import (
	"fmt"

	"github.com/eser/stack/pkg/ajan/codebasefx/validatortools"
	"github.com/eser/stack/pkg/ajan/functionsfx"
)

// Register adds every native function to the registry.
func Register(functions *functionsfx.Registry) error {
	if err := validatortools.RegisterManifestFunctions(functions); err != nil {
		return fmt.Errorf("register the validators: %w", err)
	}

	stream, err := workflowStepsFunction(workflowTools)
	if err != nil {
		return fmt.Errorf("register %s: %w", WorkflowStepsName, err)
	}

	if err := functions.Register(stream); err != nil {
		return fmt.Errorf("register %s: %w", WorkflowStepsName, err)
	}

	return nil
}
