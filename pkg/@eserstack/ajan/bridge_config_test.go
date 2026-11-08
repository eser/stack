// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func decodeConfigAnswer(t *testing.T, answer string) map[string]any {
	t.Helper()

	var got map[string]any
	if err := json.Unmarshal([]byte(answer), &got); err != nil {
		t.Fatalf("decode answer %q: %v", answer, err)
	}

	return got
}

func TestBridgeConfigParseDotenv(t *testing.T) {
	t.Parallel()

	got := decodeConfigAnswer(t, bridgeConfigParseDotenv(
		`{"text":"B=$host\n1A=x\nA='$B'","environ":[["HOST","h"]],"envCaseInsensitive":true}`,
	))

	want := `{"entries":[["B","h"],["A","$B"]],"ignored":["1A"]}`
	if encoded, _ := json.Marshal(got); string(encoded) != want {
		t.Errorf("got %s, want %s", encoded, want)
	}

	if bad := decodeConfigAnswer(t, bridgeConfigParseDotenv(`{`)); bad["error"] == nil {
		t.Errorf("a request that is not JSON is refused: %v", bad)
	}
}

func TestBridgeConfigDotenvFiles(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("A=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	empty := decodeConfigAnswer(t, bridgeConfigReadDotenvFile(`{"path":"`+filepath.Join(dir, "absent")+`"}`))
	if entries, ok := empty["entries"].([]any); !ok || len(entries) != 0 || empty["error"] != nil {
		t.Errorf("a missing file reads as empty: %v", empty)
	}

	tooLarge := decodeConfigAnswer(t, bridgeConfigReadDotenvFile(`{"path":"`+filepath.Join(dir, ".env")+`","maxFileSize":2}`))
	if tooLarge["code"] != configCodeTooLarge || tooLarge["fileSize"] != float64(4) {
		t.Errorf("a file over the limit answers too_large with its size: %v", tooLarge)
	}

	loaded := decodeConfigAnswer(t, bridgeConfigLoadDotenv(
		`{"baseDir":"`+dir+`","env":"production","envVars":[],"defaultEnvValue":"development",`+
			`"loadProcessEnv":true,"environ":[["P","1"]],"maxFileSize":null}`,
	))
	if encoded, _ := json.Marshal(loaded); string(encoded) != `{"entries":[["A","1"],["P","1"]],"envName":"production"}` {
		t.Errorf("load answers the name and the merged entries: %s", encoded)
	}

	refused := decodeConfigAnswer(t, bridgeConfigLoadDotenv(`{"baseDir":"`+dir+`","env":"x","maxFileSize":1}`))
	if refused["code"] != configCodeTooLarge || refused["filepath"] != dir+"/.env" {
		t.Errorf("load names the file over the limit: %v", refused)
	}
}

func TestBridgeConfigFiles(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	for name, content := range map[string]string{
		"a.jsonc": `{"z": 1, // c
"a": [2,],}`,
		"b.json": `{"a": 1 "b": 2}`,
		"c.yaml": "a: 1\n",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	located := decodeConfigAnswer(t, bridgeConfigLocateFile(`{"baseDir":"`+dir+`","filenames":["x.json","b.json"]}`))
	if located["path"] != filepath.Join(dir, "b.json") {
		t.Errorf("locate answers the first file found: %v", located)
	}

	if none := bridgeConfigLocateFile(`{"baseDir":"` + dir + `","filenames":["x.json"]}`); none != `{}` {
		t.Errorf("locate answers no path when nothing is found: %s", none)
	}

	if format := bridgeConfigFileFormat(`{"path":"dir\\.env","windows":true}`); format != `{"format":0}` {
		t.Errorf("a Windows path separates at the backslash: %s", format)
	}

	cases := map[string]string{
		`{"path":"` + filepath.Join(dir, "a.jsonc") + `"}`:           `{"content":{"z":1,"a":[2]},"format":3}`,
		`{"path":"` + filepath.Join(dir, "c.yaml") + `"}`:            `{"text":"a: 1\n","format":5}`,
		`{"path":"` + filepath.Join(dir, "c.yaml") + `","format":0}`: `{"format":0}`,
		`{"path":"` + filepath.Join(dir, "absent.json") + `"}`:       `"code":"not_found"`,
		`{"path":"` + filepath.Join(dir, "b.json") + `"}`:            `"code":"parse"`,
		`{"path":"` + filepath.Join(dir, "b.json") + `","format":2}`: `line 1, column 9`,
	}

	for request, want := range cases {
		answer := bridgeConfigParseFile(request)
		if answer != want && !strings.Contains(answer, want) {
			t.Errorf("configParseFile(%s) = %s, want %s", request, answer, want)
		}
	}
}
