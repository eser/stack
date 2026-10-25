// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"
	"errors"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestShellExecTimeout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		raw     string
		want    time.Duration
		wantErr error
		errText string
	}{
		{name: "unset uses the default", raw: "", want: defaultShellExecTimeout},
		{name: "positive duration is kept", raw: "90s", want: 90 * time.Second},
		{name: "milliseconds from the TS client", raw: "1500ms", want: 1500 * time.Millisecond},
		{name: "zero is rejected", raw: "0s", wantErr: errShellExecTimeoutNotPositive, errText: `"0s"`},
		{name: "negative is rejected", raw: "-1m", wantErr: errShellExecTimeoutNotPositive, errText: `"-1m"`},
		{name: "unparsable is rejected", raw: "ten minutes", errText: `parse timeout "ten minutes"`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := shellExecTimeout(tt.raw)

			if tt.errText == "" {
				if err != nil {
					t.Fatalf("shellExecTimeout(%q) returned error %v", tt.raw, err)
				}

				if got != tt.want {
					t.Fatalf("shellExecTimeout(%q) = %s, want %s", tt.raw, got, tt.want)
				}

				return
			}

			if err == nil || !strings.Contains(err.Error(), tt.errText) {
				t.Fatalf("shellExecTimeout(%q) error = %v, want one containing %q", tt.raw, err, tt.errText)
			}

			if tt.wantErr != nil && !errors.Is(err, tt.wantErr) {
				t.Fatalf("shellExecTimeout(%q) error = %v, want it to wrap %v", tt.raw, err, tt.wantErr)
			}
		})
	}
}

func TestBridgeShellExec_Timeout(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("uses the POSIX sleep command")
	}

	tests := []struct {
		name      string
		request   map[string]any
		wantError string
		wantOut   string
	}{
		{
			name:      "a command past its timeout is stopped and reported",
			request:   map[string]any{"command": "sleep", "args": []string{"5"}, "timeout": "100ms"},
			wantError: "ran past its 100ms timeout",
		},
		{
			name:      "a zero timeout is rejected before the command starts",
			request:   map[string]any{"command": "sleep", "args": []string{"5"}, "timeout": "0s"},
			wantError: "timeout must be a positive duration",
		},
		{
			name:    "a command without a timeout runs under the default",
			request: map[string]any{"command": "echo", "args": []string{"done"}},
			wantOut: "done\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			requestJSON, err := json.Marshal(tt.request)
			if err != nil {
				t.Fatalf("marshal request: %v", err)
			}

			started := time.Now()

			var resp shellExecResponse
			if err := json.Unmarshal([]byte(bridgeShellExec(string(requestJSON))), &resp); err != nil {
				t.Fatalf("unmarshal response: %v", err)
			}

			if elapsed := time.Since(started); elapsed > 4*time.Second {
				t.Fatalf("bridgeShellExec took %s; the timeout did not stop the command", elapsed)
			}

			if tt.wantError != "" {
				if !strings.Contains(resp.Error, tt.wantError) {
					t.Fatalf("error = %q, want one containing %q", resp.Error, tt.wantError)
				}

				return
			}

			if resp.Error != "" {
				t.Fatalf("unexpected error %q", resp.Error)
			}

			if resp.Stdout != tt.wantOut || resp.Code != 0 {
				t.Fatalf("stdout = %q, code = %d; want %q, 0", resp.Stdout, resp.Code, tt.wantOut)
			}
		})
	}
}
