package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// errBoom is a panic payload that is an error value rather than a string, to
// prove the guard formats any panic type rather than only strings.
var errBoom = errors.New("boom")

// The subtests below intentionally let reportPanic write its stack traces to
// stderr: that diagnostic is the whole point of the guard for an FFI caller, and
// swapping os.Stderr would race with the parallel tests elsewhere in this
// package. Expect stack traces in verbose test output.

func TestGuardString(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		fn       func() string
		wantPass string // non-empty when the call is expected to return fn's value verbatim
		wantErr  string // substring expected inside the JSON "error" field
	}{
		{
			name:     "passes result through when fn does not panic",
			fn:       func() string { return `{"handle":"h1"}` },
			wantPass: `{"handle":"h1"}`,
		},
		{
			name:    "converts string panic into error envelope",
			fn:      func() string { panic("kaboom") },
			wantErr: "panic: kaboom",
		},
		{
			name:    "converts error panic into error envelope",
			fn:      func() string { panic(errBoom) },
			wantErr: "panic: boom",
		},
		// The two cases below raise *runtime* panics rather than calling
		// panic() directly. That is the realistic FFI failure mode -- a latent
		// nil map or a bad index deep inside a bridge call -- so the fault is
		// the point of the case, and the linters that spot it statically are
		// silenced here instead of the case being softened.
		{
			name:    "converts runtime nil map write into error envelope",
			fn:      func() string { var m map[string]string; m["k"] = "v"; return "" }, //nolint:staticcheck // SA5000: the nil map write is the fault under test
			wantErr: "panic: assignment to entry in nil map",
		},
		{
			name:    "converts runtime index out of range into error envelope",
			fn:      func() string { var s []string; return s[3] }, //nolint:gosec // G602: the out-of-range index is the fault under test
			wantErr: "panic: runtime error: index out of range",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := guardString(tt.fn)

			if tt.wantPass != "" {
				if got != tt.wantPass {
					t.Fatalf("guardString() = %q, want %q", got, tt.wantPass)
				}

				return
			}

			var resp struct {
				Error string `json:"error"`
			}

			if err := json.Unmarshal([]byte(got), &resp); err != nil {
				t.Fatalf("guardString() returned non-JSON %q: %v", got, err)
			}

			if !strings.Contains(resp.Error, tt.wantErr) {
				t.Errorf("error field = %q, want it to contain %q", resp.Error, tt.wantErr)
			}

			// The payload handed back over FFI must stay compact: the stack
			// trace belongs on stderr, not in the JSON.
			if strings.Contains(got, "goroutine ") {
				t.Errorf("guardString() leaked a stack trace into the payload: %q", got)
			}
		})
	}
}

func TestGuardInt(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		fn   func() int
		want int
	}{
		{
			name: "passes result through when fn does not panic",
			fn:   func() int { return 0 },
			want: 0,
		},
		{
			name: "passes non-zero result through unchanged",
			fn:   func() int { return 7 },
			want: 7,
		},
		{
			name: "reports failure code on panic",
			fn:   func() int { panic("init exploded") },
			want: guardFailureCode,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := guardInt(tt.fn); got != tt.want {
				t.Errorf("guardInt() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestGuardVoid(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		shouldStop bool // fn panics partway, so the tail must not run
	}{
		{name: "runs fn to completion when it does not panic", shouldStop: false},
		{name: "swallows panic instead of killing the process", shouldStop: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			started, finished := false, false

			// A panic escaping guardVoid would fail the test by unwinding out
			// of the subtest; reaching the assertions at all proves it did not.
			guardVoid(func() {
				started = true

				if tt.shouldStop {
					panic("shutdown exploded")
				}

				finished = true
			})

			if !started {
				t.Fatal("guardVoid() never invoked fn")
			}

			if finished == tt.shouldStop {
				t.Errorf("fn completion = %v, want %v", finished, !tt.shouldStop)
			}
		})
	}
}

func TestReportPanic(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		recovered any
		want      string
	}{
		{name: "formats string payload", recovered: "kaboom", want: "panic: kaboom"},
		{name: "formats error payload", recovered: errBoom, want: "panic: boom"},
		{name: "formats arbitrary payload", recovered: 42, want: "panic: 42"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := reportPanic(tt.recovered); got != tt.want {
				t.Errorf("reportPanic() = %q, want %q", got, tt.want)
			}
		})
	}
}
