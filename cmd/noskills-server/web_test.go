// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"testing"
)

func TestParseWebArgs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		args    []string
		want    webOptions
		wantErr bool
	}{
		{name: "defaults", args: nil, want: webOptions{root: "", port: 3000, open: false, logLevel: "WARN"}},
		{
			name: "every flag", args: []string{"--root", "/srv/project", "--port", "4000", "--open", "--log-level", "DEBUG"},
			want: webOptions{root: "/srv/project", port: 4000, open: true, logLevel: "DEBUG"},
		},
		{name: "port zero", args: []string{"--port", "0"}, wantErr: true},
		{name: "port too large", args: []string{"--port", "65536"}, wantErr: true},
		{name: "unknown flag", args: []string{"--nope"}, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got, err := parseWebArgs(tt.args)
			if tt.wantErr {
				if err == nil {
					t.Errorf("parseWebArgs(%q) = %+v, want an error", tt.args, got)
				}

				return
			}

			if err != nil || got != tt.want {
				t.Errorf("parseWebArgs(%q) = %+v, %v; want %+v", tt.args, got, err, tt.want)
			}
		})
	}
}

// web refuses a project that noskills has not initialized, before it
// listens, as `noskills web` did.
func TestRunWebRefusesAnUninitializedProject(t *testing.T) {
	t.Parallel()

	if code := runWeb([]string{"--root", t.TempDir(), "--port", "1"}); code != 1 {
		t.Errorf("runWeb() = %d, want 1", code)
	}
}
