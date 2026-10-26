// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// ValidateSecrets: shape parity with validate-secrets.ts and the line-based,
// keyword-gated scan that replaced the whole-file regex pass.

package codebasefx_test

import (
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

func TestValidateSecrets_Shapes(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		content   string
		wantLines []int
		wantMsg   string
	}{
		{
			name:      "quoted generic assignment is reported once, on its line",
			content:   "name = 'svc'\napi_key = \"abcdefghijklmnop\"\nnext\n",
			wantLines: []int{2},
			wantMsg:   "potential Generic secret assignment detected",
		},
		{
			name:      "keyword variants and case are covered",
			content:   "ACCESS_TOKEN: 'abcdefghijkl'\nAuth_Token=\"abcdefghijkl\"\nprivate_key : 'abcdefghijkl'\n",
			wantLines: []int{1, 2, 3},
			wantMsg:   "potential Generic secret assignment detected",
		},
		{
			// Parity with the TypeScript validator: prose and unquoted values
			// are not findings. The old Go pattern matched these and reported
			// 84 issues in this repo where TypeScript reported 2.
			name:      "unquoted values and prose are not findings",
			content:   "the token: abcdefghijklmnop is rotated daily\npassword = abcdefghijkl\nsecret\n",
			wantLines: nil,
		},
		{
			name:      "short quoted values are not findings",
			content:   "password = 'short'\n",
			wantLines: nil,
		},
		{
			name:      "AWS access key id",
			content:   "x\nkey AKIAIOSFODNN7EXAMPLE here\n",
			wantLines: []int{2},
			wantMsg:   "potential AWS Access Key ID detected",
		},
		{
			name:      "PEM private key header with variable spacing",
			content:   "-----BEGIN  RSA   PRIVATE KEY-----\n",
			wantLines: []int{1},
			wantMsg:   "potential Private Key detected",
		},
		{
			name:      "one issue per line even when two shapes match",
			content:   "secret = 'AKIAIOSFODNN7EXAMPLE'\n",
			wantLines: []int{1},
		},
		{
			name:      "no trailing newline still scans the last line",
			content:   "a\nb\napi_key='abcdefghijklmnop'",
			wantLines: []int{3},
		},
		{
			name:      "a file without any keyword is clean",
			content:   strings.Repeat("const x = 1;\n", 200),
			wantLines: nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			issues := codebasefx.ValidateSecrets("config.ts", []byte(tc.content))

			var gotLines []int
			for _, iss := range issues {
				gotLines = append(gotLines, iss.Line)

				if tc.wantMsg != "" && iss.Message != tc.wantMsg {
					t.Errorf("message = %q, want %q", iss.Message, tc.wantMsg)
				}
			}

			if len(gotLines) != len(tc.wantLines) {
				t.Fatalf("lines = %v, want %v (issues: %+v)", gotLines, tc.wantLines, issues)
			}

			for i := range gotLines {
				if gotLines[i] != tc.wantLines[i] {
					t.Errorf("lines = %v, want %v", gotLines, tc.wantLines)
				}
			}
		})
	}
}

func TestValidateSecrets_InvalidUTF8IsSkipped(t *testing.T) {
	t.Parallel()

	content := append([]byte("api_key = 'abcdefghijklmnop'\n"), 0xff, 0xfe)
	if issues := codebasefx.ValidateSecrets("blob.bin", content); len(issues) != 0 {
		t.Errorf("expected binary content to be skipped, got %+v", issues)
	}
}

func BenchmarkValidateSecrets_NoKeyword(b *testing.B) {
	content := []byte(strings.Repeat("export const value = compute(input, options);\n", 2000))

	b.ReportAllocs()
	b.ResetTimer()

	for range b.N {
		codebasefx.ValidateSecrets("big.ts", content)
	}
}

func BenchmarkValidateSecrets_KeywordEveryLine(b *testing.B) {
	content := []byte(strings.Repeat("token = fetchToken(secretStore, password)\n", 2000))

	b.ReportAllocs()
	b.ResetTimer()

	for range b.N {
		codebasefx.ValidateSecrets("big.ts", content)
	}
}
