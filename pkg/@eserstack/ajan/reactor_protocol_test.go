// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"slices"
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

func TestRunReactorCallRoutesTheFourOperations(t *testing.T) {
	t.Parallel()

	call := runReactorCall("formatList", nil)
	if !call.OK || call.Result == nil {
		t.Fatalf("formatList with no argument: %+v", call)
	}

	opened := runReactorCall(reactorStreamOpen, []string{"parsingTokenizeStream", "{}"})
	if !opened.OK || opened.Result == nil {
		t.Fatalf("stream.open: %+v", opened)
	}

	var created struct {
		Handle string `json:"handle"`
	}
	if err := json.Unmarshal([]byte(*opened.Result), &created); err != nil || created.Handle == "" {
		t.Fatalf("stream.open answer %q: %v", *opened.Result, err)
	}

	pushed := runReactorCall("parsingTokenizeStreamPush", []string{`{"handle":"` + created.Handle + `","chunk":"a + b"}`})
	if !pushed.OK {
		t.Errorf("push: %+v", pushed)
	}

	if read := runReactorCall(reactorStreamRead, []string{created.Handle}); read.OK || read.Code != codeKindMismatch {
		t.Errorf("a push-fed stream has no read: %+v", read)
	}

	if closed := runReactorCall(reactorStreamClose, []string{created.Handle}); !closed.OK {
		t.Errorf("stream.close: %+v", closed)
	}
}

func TestRunReactorCallRefusesWrongArgumentCounts(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		name string
		args []string
	}{
		{name: "formatEncode", args: []string{"{}", "{}"}},
		{name: reactorStreamOpen, args: []string{"parsingTokenizeStream"}},
		{name: reactorStreamRead, args: nil},
		{name: reactorStreamClose, args: []string{"a", "b"}},
	} {
		env := runReactorCall(tc.name, tc.args)
		if env.OK || env.Code != codeBadRequest || env.Result != nil {
			t.Errorf("%s with %d argument(s): %+v", tc.name, len(tc.args), env)
		}
	}
}
