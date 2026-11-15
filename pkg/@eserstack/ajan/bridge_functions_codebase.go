// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"github.com/eser/stack/pkg/ajan/nativefx"
)

// The functions of the bridge (ADR 0011): the catalog of nativefx, which is
// what the type generator reads too. The first are the validators of
// codebasefx (TASK-395), the same tools the workflow engine runs
// (bridge_workflow.go), seen as functions, so TypeScript calls them through
// functionCall with the input and output schemas of their descriptors.
func init() {
	if err := nativefx.Register(bridgeFunctions); err != nil {
		panic("bridge functions: " + err.Error())
	}
}
