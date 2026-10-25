// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/csfx"
)

func TestResolveEnvName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		explicit string
		environ  []string
		want     string
	}{
		{name: "explicit wins", explicit: "staging", environ: []string{"ENV=production"}, want: "staging"},
		{name: "first set variable", environ: []string{"NODE_ENV=test", "APP_ENV=production"}, want: "production"},
		{name: "empty value is skipped", environ: []string{"ENV=", "NODE_ENV=test"}, want: "test"},
		// The @eserstack/config dotenv loader no longer reads DENO_ENV.
		{name: "DENO_ENV is not read", environ: []string{"DENO_ENV=production"}, want: csfx.DefaultEnvName},
		{name: "nothing set", want: csfx.DefaultEnvName},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := csfx.ResolveEnvName(tt.explicit, tt.environ); got != tt.want {
				t.Errorf("ResolveEnvName(%q, %q) = %q, want %q", tt.explicit, tt.environ, got, tt.want)
			}
		})
	}
}
