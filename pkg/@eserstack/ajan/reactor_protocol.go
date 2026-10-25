// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

// The call protocol of the WASM reactor (main_wasi_reactor.go), kept free of
// build tags so the native test suite covers it too.

import (
	"encoding/binary"
	"encoding/json"
	"errors"
)

// reactorABIVersion changes whenever the protocol above changes; a host
// refuses a module with a different one.
const reactorABIVersion = 2

// reactorProfile names the set of functions this build serves.
const reactorProfile = "wasi"

// errTruncatedArgs is the error for arguments whose length prefixes run past
// the end of the bytes the host passed.
var errTruncatedArgs = errors.New("the arguments end inside a length prefix or a value")

// envelope is what eser_ajan_call stores for the host.
type envelope struct {
	Result  *string  `json:"result,omitempty"`
	Error   string   `json:"error,omitempty"`
	Profile string   `json:"profile,omitempty"`
	Names   []string `json:"names,omitempty"`
	ABI     int      `json:"abi,omitempty"`
	OK      bool     `json:"ok"`
}

// runCall runs one registry function under the panic guard and builds its
// envelope.
func runCall(name string, args []string) envelope {
	var callErr error

	result := guardString(func() string {
		out, err := callRegistered(name, args)
		callErr = err

		return out
	})

	if callErr != nil {
		return envelope{Error: callErr.Error()} //nolint:exhaustruct
	}

	env := envelope{Result: &result, OK: true} //nolint:exhaustruct
	if msg, failed := answerError(result); failed {
		env.OK = false
		env.Error = msg
	}

	if name == "version" {
		env.ABI = reactorABIVersion
		env.Profile = reactorProfile
		env.Names = registeredNames()
	}

	return env
}

// answerError reports whether a function's answer is a JSON object with an
// "error" string, the way bridge functions report failure.
func answerError(answer string) (string, bool) {
	if len(answer) == 0 || answer[0] != '{' {
		return "", false
	}

	var probe struct {
		Error *string `json:"error"`
	}

	if err := json.Unmarshal([]byte(answer), &probe); err != nil || probe.Error == nil || *probe.Error == "" {
		return "", false
	}

	return *probe.Error, true
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
