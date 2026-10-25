// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"encoding/binary"
	"errors"
	"slices"
	"strings"
	"testing"
)

// encodeArgsForTest builds the length-prefixed argument bytes a host sends.
func encodeArgsForTest(args ...string) []byte {
	var out []byte

	for _, arg := range args {
		out = binary.LittleEndian.AppendUint32(out, uint32(len(arg))) //nolint:gosec // test fixtures are tiny
		out = append(out, arg...)
	}

	return out
}

func TestDecodeArgs(t *testing.T) {
	t.Parallel()

	got, err := decodeArgs(encodeArgsForTest(`{"a":1}`, "", "handle-7"))
	if err != nil {
		t.Fatal(err)
	}

	if !slices.Equal(got, []string{`{"a":1}`, "", "handle-7"}) {
		t.Errorf("got %q", got)
	}

	none, err := decodeArgs(nil)
	if err != nil || len(none) != 0 {
		t.Errorf("no bytes should decode to no arguments, got %q, %v", none, err)
	}

	for _, broken := range [][]byte{
		{1, 0},               // a length prefix cut short
		{5, 0, 0, 0, 'a'},    // a value shorter than its prefix
		{255, 255, 255, 255}, // a prefix past the end
	} {
		if _, err := decodeArgs(broken); !errors.Is(err, errTruncatedArgs) {
			t.Errorf("decodeArgs(%v): expected errTruncatedArgs, got %v", broken, err)
		}
	}
}

func TestRunCallUnknownNameAndArity(t *testing.T) {
	t.Parallel()

	unknown := runCall("noSuchFunction", nil)
	if unknown.OK || !strings.Contains(unknown.Error, "unknown function: noSuchFunction") || unknown.Result != nil {
		t.Errorf("unknown name: %+v", unknown)
	}

	arity := runCall("formatEncode", nil)
	if arity.OK || !strings.Contains(arity.Error, "formatEncode takes 1 argument(s) (requestJSON), got 0") {
		t.Errorf("wrong arity: %+v", arity)
	}
}

func TestRunCallErrorAnswerFailsTheEnvelope(t *testing.T) {
	t.Parallel()

	env := runCall("formatEncode", []string{`not json`})
	if env.OK || env.Error == "" || env.Result == nil || !strings.Contains(*env.Result, `"error"`) {
		t.Errorf("an answer with an error field must fail the envelope and keep the answer: %+v", env)
	}

	ok := runCall("formatList", nil)
	if !ok.OK || ok.Result == nil || ok.Error != "" {
		t.Errorf("formatList: %+v", ok)
	}
}

func TestRunCallRecoversAPanicAndKeepsServing(t *testing.T) {
	// Not parallel: it adds a name to the shared registry.
	register("testPanicsOnPurpose", nil, func(_ []string) string { panic("on purpose") })
	t.Cleanup(func() { delete(registry, "testPanicsOnPurpose") })

	panicked := runCall("testPanicsOnPurpose", nil)
	if panicked.OK || !strings.Contains(panicked.Error, "panic: on purpose") {
		t.Errorf("a panic must become a failed envelope: %+v", panicked)
	}

	after := runCall("formatList", nil)
	if !after.OK {
		t.Errorf("a call after the panic must succeed: %+v", after)
	}
}

func TestRunCallVersionCarriesTheHandshake(t *testing.T) {
	t.Parallel()

	env := runCall("version", nil)
	if !env.OK || env.ABI != reactorABIVersion || env.Profile != reactorProfile {
		t.Fatalf("version envelope: %+v", env)
	}

	if !slices.Contains(env.Names, "formatEncode") || !slices.IsSorted(env.Names) {
		t.Errorf("handshake names: %v", env.Names)
	}

	if other := runCall("formatList", nil); other.ABI != 0 || other.Names != nil {
		t.Errorf("only version carries the handshake: %+v", other)
	}
}

func TestRegisteredNamesCoverEveryFunction(t *testing.T) {
	t.Parallel()

	// The native build registers every domain: the 99 dispatch names.
	if got := len(registeredNames()); got != 99 {
		t.Errorf("expected 99 registered names, got %d", got)
	}
}

func TestRunCallRefusesADeeplyNestedRequest(t *testing.T) {
	t.Parallel()

	deep := `{"format":"json","data":` + strings.Repeat("[", 10_000) + strings.Repeat("]", 10_000) + `}`

	env := runCall("formatEncode", []string{deep})
	if env.OK || !strings.Contains(env.Error, "more than 1000 levels") {
		t.Errorf("a request nested 10,000 levels deep must be refused: %+v", env)
	}

	if after := runCall("formatList", nil); !after.OK {
		t.Errorf("a call after the refusal must succeed: %+v", after)
	}
}
