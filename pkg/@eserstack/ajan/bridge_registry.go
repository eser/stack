// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"encoding/json"
	"sort"
)

// entryKind tells how a host reaches a dispatch name: a call answers once,
// a stream is opened, read and closed.
type entryKind string

const (
	kindCall   entryKind = "call"
	kindStream entryKind = "stream"
)

// callFunc is a bridge function behind a call name: it takes the request
// string (JSON for most names, the bare handle for the few that take only a
// handle, empty for the ones that take nothing) and answers a string, JSON
// with an "error" field on failure.
type callFunc func(request string) string

// streamFuncs are the three bridge functions behind a stream name. open
// answers JSON with a "handle"; read answers the next chunk, or "null" when
// the stream is done; close releases the handle and answers JSON. read is nil
// for a stream that is fed by a call instead (parsingTokenizeStream, whose
// chunks go in through parsingTokenizeStreamPush).
type streamFuncs struct {
	open  callFunc
	read  func(handle string) string
	close func(handle string) string
}

// registryEntry is one dispatch name of the registry.
type registryEntry struct {
	call         callFunc
	stream       streamFuncs
	kind         entryKind
	handlePrefix string
}

// registry maps a dispatch name, such as "formatEncode", to its bridge
// functions. Each domain file adds its names from init(), so a build that
// leaves a domain out, like the WASM profile, has none of that domain's
// names. The native exports (main.go) and the WASM reactor
// (main_wasi_reactor.go) both dispatch through it.
var registry = map[string]registryEntry{} //nolint:gochecknoglobals

// streamPrefixes maps the prefix of a stream's handles, such as "cbwalk" in
// "cbwalk-12", to its stream name, so a read or close finds its stream from
// the handle alone.
var streamPrefixes = map[string]string{} //nolint:gochecknoglobals

// register adds a call name. A name registered twice is a programming error,
// caught at startup.
func register(name string, call callFunc) {
	if _, dup := registry[name]; dup {
		panic("bridge registry: " + name + " is registered twice")
	}

	registry[name] = registryEntry{call: call, kind: kindCall} //nolint:exhaustruct
}

// registerStream adds a stream name whose handles start with handlePrefix
// and a dash (newHandle builds them so).
func registerStream(name string, handlePrefix string, funcs streamFuncs) {
	if _, dup := registry[name]; dup {
		panic("bridge registry: " + name + " is registered twice")
	}

	if owner, dup := streamPrefixes[handlePrefix]; dup {
		panic("bridge registry: handle prefix " + handlePrefix + " belongs to " + owner)
	}

	registry[name] = registryEntry{ //nolint:exhaustruct
		stream:       funcs,
		kind:         kindStream,
		handlePrefix: handlePrefix,
	}
	streamPrefixes[handlePrefix] = name
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

// registeredStreams returns the stream names of this build, sorted.
func registeredStreams() []string {
	names := make([]string, 0, len(streamPrefixes))
	for _, name := range streamPrefixes {
		names = append(names, name)
	}

	sort.Strings(names)

	return names
}

// handleRequest is the request of a stream close that its bridge function
// takes as JSON.
func handleRequest(handle string) string {
	return marshalResponse(struct {
		Handle string `json:"handle"`
	}{Handle: handle})
}

// modelRequest is the request of the AI calls that run on a model handle:
// aiGenerateText and the aiTextStream open.
type modelRequest struct {
	ModelHandle string          `json:"modelHandle"`
	Options     json.RawMessage `json:"options"`
}

// withModel decodes a modelRequest and hands its two parts to fn.
func withModel(fn func(modelHandle, optionsJSON string) string) callFunc {
	return func(request string) string {
		var req modelRequest
		if err := json.Unmarshal([]byte(request), &req); err != nil {
			return errorResponse("invalid request JSON: " + err.Error())
		}

		options := string(req.Options)
		if options == "" || options == "null" {
			options = "{}"
		}

		return fn(req.ModelHandle, options)
	}
}

func init() {
	register("version", func(string) string { return handshakeJSON() })
	register("init", func(string) string {
		if bridgeInit() != 0 {
			return marshalError("init failed")
		}

		return "{}"
	})
	register("shutdown", func(string) string {
		bridgeShutdown()

		return "{}"
	})
	register("diResolve", bridgeDIResolve)
}
