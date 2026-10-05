package noskillsserverfx

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckForUpdate(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		status     int
		body       string
		current    string
		wantNotice string // substring of the notice; "" means nothing is written
		wantErr    string // substring of the error; "" means success
	}{
		{
			name:       "newer release",
			status:     http.StatusOK,
			body:       `{"tag_name":"v1.3.0"}`,
			current:    "1.2.9",
			wantNotice: "noskills-server 1.3.0 is available (you have 1.2.9)",
		},
		{
			name:    "same release",
			status:  http.StatusOK,
			body:    `{"tag_name":"v1.2.9"}`,
			current: "1.2.9",
		},
		{
			name:    "older release",
			status:  http.StatusOK,
			body:    `{"tag_name":"1.0.0"}`,
			current: "1.2.9",
		},
		{
			name:    "rate limited",
			status:  http.StatusForbidden,
			body:    `{"message":"API rate limit exceeded"}`,
			current: "1.2.9",
			wantErr: "status 403",
		},
		{
			name:    "malformed reply",
			status:  http.StatusOK,
			body:    `{"tag_name":`,
			current: "1.2.9",
			wantErr: "decode latest release",
		},
		{
			name:    "release without a tag",
			status:  http.StatusOK,
			body:    `{"name":"nightly"}`,
			current: "1.2.9",
			wantErr: "has no tag_name",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if got := r.Header.Get("Accept"); got != "application/vnd.github+json" {
					t.Errorf("Accept = %q, want the GitHub media type", got)
				}

				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body) // the client side asserts on what arrives
			}))
			t.Cleanup(server.Close)

			var out bytes.Buffer

			err := checkForUpdate(t.Context(), server.Client(), server.URL, tc.current, &out)

			if tc.wantErr == "" && err != nil {
				t.Fatalf("checkForUpdate() = %v, want nil", err)
			}

			if tc.wantErr != "" {
				if !errors.Is(err, ErrUpdateCheck) || !strings.Contains(err.Error(), tc.wantErr) {
					t.Fatalf("checkForUpdate() = %v, want ErrUpdateCheck containing %q", err, tc.wantErr)
				}
			}

			if tc.wantNotice == "" && out.Len() != 0 {
				t.Errorf("wrote %q, want nothing", out.String())
			}

			if tc.wantNotice != "" && !strings.Contains(out.String(), tc.wantNotice) {
				t.Errorf("wrote %q, want it to contain %q", out.String(), tc.wantNotice)
			}
		})
	}
}

// TestCheckForUpdateEndsWithTheCallersContext pins that the check uses the
// context it is given: a daemon shutting down does not wait for GitHub.
func TestCheckForUpdateEndsWithTheCallersContext(t *testing.T) {
	t.Parallel()

	requested := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		close(requested)
		<-r.Context().Done() // never answers; the client gives up
	}))
	t.Cleanup(server.Close)

	ctx, cancel := context.WithCancel(t.Context())
	result := make(chan error, 1)

	go func() {
		result <- checkForUpdate(ctx, server.Client(), server.URL, "1.0.0", io.Discard)
	}()

	<-requested
	cancel()

	if err := <-result; !errors.Is(err, context.Canceled) || !errors.Is(err, ErrUpdateCheck) {
		t.Fatalf("checkForUpdate() after cancel = %v, want ErrUpdateCheck wrapping context.Canceled", err)
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

func TestCheckForUpdateReportsAnUnwrittenNotice(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"tag_name":"v9.0.0"}`) // the client asserts on the result
	}))
	t.Cleanup(server.Close)

	err := checkForUpdate(t.Context(), server.Client(), server.URL, "1.0.0", failingWriter{})
	if !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("checkForUpdate() = %v, want the writer's error", err)
	}
}

func TestIsNewer(t *testing.T) {
	t.Parallel()

	cases := []struct {
		latest, current string
		want            bool
	}{
		{"1.2.10", "1.2.9", true},
		{"2.0.0", "1.99.99", true},
		{"1.2.9", "1.2.9", false},
		{"1.2.8", "1.2.9", false},
		{"1.3.0-rc1", "1.2.9", true},
		{"garbage", "1.2.9", false},
	}

	for _, tc := range cases {
		t.Run(tc.latest+" vs "+tc.current, func(t *testing.T) {
			t.Parallel()

			if got := isNewer(tc.latest, tc.current); got != tc.want {
				t.Errorf("isNewer(%q, %q) = %v, want %v", tc.latest, tc.current, got, tc.want)
			}
		})
	}
}
