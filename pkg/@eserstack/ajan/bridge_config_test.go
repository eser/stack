// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// configTestDir answers a temporary directory whose path needs escaping in
// JSON, as a Windows path does with its backslashes, so a request that is not
// encoded as JSON fails on every platform. Windows refuses a quote in a name,
// and its own temporary paths carry the backslashes.
func configTestDir(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	if runtime.GOOS == "windows" {
		return dir
	}

	dir = filepath.Join(dir, `C:\Users\runner "quoted"`)
	if err := os.Mkdir(dir, 0o700); err != nil {
		t.Fatal(err)
	}

	return dir
}

func decodeConfigAnswer(t *testing.T, answer string) map[string]any {
	t.Helper()

	var got map[string]any
	if err := json.Unmarshal([]byte(answer), &got); err != nil {
		t.Fatalf("decode answer %q: %v", answer, err)
	}

	return got
}

// configRequest encodes a request as JSON, so a path is escaped whatever
// characters it holds.
func configRequest(t *testing.T, fields map[string]any) string {
	t.Helper()

	encoded, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}

	return string(encoded)
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

	dir := configTestDir(t)
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("A=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	empty := decodeConfigAnswer(t, bridgeConfigReadDotenvFile(configRequest(t, map[string]any{"path": filepath.Join(dir, "absent")})))
	if entries, ok := empty["entries"].([]any); !ok || len(entries) != 0 || empty["error"] != nil {
		t.Errorf("a missing file reads as empty: %v", empty)
	}

	tooLarge := decodeConfigAnswer(t, bridgeConfigReadDotenvFile(configRequest(t, map[string]any{
		"path": filepath.Join(dir, ".env"), "maxFileSize": 2,
	})))
	if tooLarge["code"] != configCodeTooLarge || tooLarge["fileSize"] != float64(4) {
		t.Errorf("a file over the limit answers too_large with its size: %v", tooLarge)
	}

	loaded := decodeConfigAnswer(t, bridgeConfigLoadDotenv(configRequest(t, map[string]any{
		"baseDir": dir, "env": "production", "envVars": []string{}, "defaultEnvValue": "development",
		"loadProcessEnv": true, "environ": [][]string{{"P", "1"}}, "maxFileSize": nil,
	})))
	if encoded, _ := json.Marshal(loaded); string(encoded) != `{"entries":[["A","1"],["P","1"]],"envName":"production"}` {
		t.Errorf("load answers the name and the merged entries: %s", encoded)
	}

	// LoadDotenv joins the base directory and the file name with a slash on
	// every platform, as the TypeScript loader did.
	refused := decodeConfigAnswer(t, bridgeConfigLoadDotenv(configRequest(t, map[string]any{
		"baseDir": dir, "env": "x", "maxFileSize": 1,
	})))
	if refused["code"] != configCodeTooLarge || refused["filepath"] != dir+"/.env" {
		t.Errorf("load names the file over the limit: %v", refused)
	}
}

func TestBridgeConfigFiles(t *testing.T) {
	t.Parallel()

	dir := configTestDir(t)
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

	located := decodeConfigAnswer(t, bridgeConfigLocateFile(configRequest(t, map[string]any{
		"baseDir": dir, "filenames": []string{"x.json", "b.json"},
	})))
	if located["path"] != filepath.Join(dir, "b.json") {
		t.Errorf("locate answers the first file found: %v", located)
	}

	none := bridgeConfigLocateFile(configRequest(t, map[string]any{"baseDir": dir, "filenames": []string{"x.json"}}))
	if none != `{}` {
		t.Errorf("locate answers no path when nothing is found: %s", none)
	}

	if format := bridgeConfigFileFormat(`{"path":"dir\\.env","windows":true}`); format != `{"format":0}` {
		t.Errorf("a Windows path separates at the backslash: %s", format)
	}

	cases := []struct {
		request map[string]any
		want    string
	}{
		{map[string]any{"path": filepath.Join(dir, "a.jsonc")}, `{"content":{"z":1,"a":[2]},"format":3}`},
		{map[string]any{"path": filepath.Join(dir, "c.yaml")}, `{"text":"a: 1\n","format":5}`},
		{map[string]any{"path": filepath.Join(dir, "c.yaml"), "format": 0}, `{"format":0}`},
		{map[string]any{"path": filepath.Join(dir, "absent.json")}, `"code":"not_found"`},
		{map[string]any{"path": filepath.Join(dir, "b.json")}, `"code":"parse"`},
		{map[string]any{"path": filepath.Join(dir, "b.json"), "format": 2}, `line 1, column 9`},
	}

	for _, tt := range cases {
		request := configRequest(t, tt.request)
		answer := bridgeConfigParseFile(request)
		if answer != tt.want && !strings.Contains(answer, tt.want) {
			t.Errorf("configParseFile(%s) = %s, want %s", request, answer, tt.want)
		}
	}
}
