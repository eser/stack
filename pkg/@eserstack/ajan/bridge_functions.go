// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

// The functions of pkg/ajan/functionsfx, served by name (ADR 0011). Every
// function is reached through two generic names, so the handshake lists these
// two and not one name per function, and a function added later changes no ABI:
//
//	functionCall { name, input, requestId? } -> { output } | { error, errorKind }
//	functionList                             -> { functions: [descriptor...] }
//
// A call is cancelled the way an AI call is: the library adds a requestId and
// runs aiCancelRequest when the caller's AbortSignal fires, which ends the
// context the function runs on. The error answers carry the kind of the error
// as errorKind, next to error, the shape the AI answers already use.
//
// The WASM profile does not serve these names. Schema validation links
// jsonschema into the module, which measured +1.7 MB (8.09 MB to 9.82 MB, a
// 21% rise), and no function runs there yet, so the profile answers
// UNSUPPORTED_IN_WASM for both names, like for any name it leaves out. The
// WASM flag of a descriptor stays: the first function that has to run in the
// profile adds these names to it, with the size measured again.

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

// kindUnknownFunction is the errorKind of a call to a name the registry does
// not hold. It shares errorKind with the kinds of functionsfx but no function
// raises it: the bridge does.
const kindUnknownFunction functionsfx.Kind = "UnknownFunction"

// bridgeFunctions holds the functions this build serves. It starts empty: the
// domain files that expose functions (TASK-395 is the first) register theirs
// from init(), like they register dispatch names, and treat an error from
// Register as the startup bug it is.
var bridgeFunctions = functionsfx.NewRegistry() //nolint:gochecknoglobals

type functionCallRequest struct {
	Name string `json:"name"`
	// Input is the JSON the function decodes; absent reads as null.
	Input json.RawMessage `json:"input"`
	// RequestID names the call for aiCancelRequest. Empty means the caller did
	// not ask for cancellation.
	RequestID string `json:"requestId"`
}

type functionCallResponse struct {
	Output    json.RawMessage  `json:"output,omitempty"`
	Error     string           `json:"error,omitempty"`
	ErrorKind functionsfx.Kind `json:"errorKind,omitempty"`
}

type functionListResponse struct {
	Functions []functionsfx.Descriptor `json:"functions"`
}

// functionFailure answers a failure with its message and kind. An empty message
// would read as success to the dispatcher (an error answer needs a non-empty
// "error"), so it is replaced.
func functionFailure(message string, kind functionsfx.Kind) string {
	if message == "" {
		message = "function failed"
	}

	return marshalResponse(functionCallResponse{Error: message, ErrorKind: kind}) //nolint:exhaustruct
}

// functionError answers the failure of err, keeping its kind.
func functionError(err error) string {
	return functionFailure(functionsfx.MessageOf(err), streamOnlyKind(err))
}

// bridgeFunctionCall serves functionCall on a registry.
func bridgeFunctionCall(registry *functionsfx.Registry) callFunc {
	return func(requestJSON string) string {
		var req functionCallRequest
		if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
			return errorResponse("invalid request JSON: " + err.Error())
		}

		function, ok := registry.Get(req.Name)
		if !ok {
			return functionFailure(fmt.Sprintf("unknown function: %q", req.Name), kindUnknownFunction)
		}

		ctx, done, proceed := beginCancellable(req.RequestID)
		defer done()

		if !proceed {
			return functionError(functionsfx.NewAbortError("function call cancelled: " + context.Canceled.Error()))
		}

		output, err := function.Call(ctx, req.Input)
		if err != nil {
			return functionError(err)
		}

		return marshalResponse(functionCallResponse{Output: output}) //nolint:exhaustruct
	}
}

// bridgeFunctionList serves functionList on a registry: the descriptors of
// every function, sorted by name.
func bridgeFunctionList(registry *functionsfx.Registry) callFunc {
	return func(string) string {
		return marshalResponse(functionListResponse{Functions: registry.List()})
	}
}

func init() {
	register("functionCall", bridgeFunctionCall(bridgeFunctions))
	register("functionList", bridgeFunctionList(bridgeFunctions))
}
