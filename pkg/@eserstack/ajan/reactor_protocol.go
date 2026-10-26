// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

// The call protocol of the WASM reactor (main_wasi_reactor.go), kept free of
// build tags so the native test suite covers it too.
//
// The reactor has one entry point per result buffer, so the four dispatcher
// operations travel as names: a registry name is a call with one argument,
// the request; the three reserved names below, which no registry name can
// take because they hold a dot, are the stream operations.

import (
	"encoding/binary"
	"errors"
)

// The reserved names of the stream operations on the reactor.
const (
	// reactorStreamOpen takes the stream name and the request.
	reactorStreamOpen = "stream.open"
	// reactorStreamRead takes the handle.
	reactorStreamRead = "stream.read"
	// reactorStreamClose takes the handle.
	reactorStreamClose = "stream.close"
)

// errTruncatedArgs is the error for arguments whose length prefixes run past
// the end of the bytes the host passed.
var errTruncatedArgs = errors.New("the arguments end inside a length prefix or a value")

// runReactorCall runs one reactor call: a dispatcher operation named by name,
// with its arguments.
func runReactorCall(name string, args []string) envelope {
	switch name {
	case reactorStreamOpen:
		if len(args) != 2 {
			return failed(codeBadRequest, "%s takes the stream name and the request, got %d argument(s)", name, len(args))
		}

		return dispatchStreamOpen(args[0], args[1])
	case reactorStreamRead, reactorStreamClose:
		if len(args) != 1 {
			return failed(codeBadRequest, "%s takes the handle, got %d argument(s)", name, len(args))
		}

		if name == reactorStreamRead {
			return dispatchStreamRead(args[0])
		}

		return dispatchStreamClose(args[0])
	}

	switch len(args) {
	case 0:
		return dispatchCall(name, "")
	case 1:
		return dispatchCall(name, args[0])
	default:
		return failed(codeBadRequest, "%s takes one request, got %d argument(s)", name, len(args))
	}
}

// decodeArgs splits length-prefixed arguments.
func decodeArgs(raw []byte) ([]string, error) {
	var args []string

	for len(raw) > 0 {
		if len(raw) < 4 {
			return nil, errTruncatedArgs
		}

		size := binary.LittleEndian.Uint32(raw[:4])
		raw = raw[4:]

		if uint64(size) > uint64(len(raw)) {
			return nil, errTruncatedArgs
		}

		args = append(args, string(raw[:size]))
		raw = raw[size:]
	}

	return args, nil
}
