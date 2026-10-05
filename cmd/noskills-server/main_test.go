package main

import (
	"net"
	"slices"
	"testing"
	"time"
)

// runStart starts the server before it waits for a signal, so an address it
// cannot listen on ends the command with exit code 1. When the start ran in
// a goroutine, the failure was only logged and the command waited for a
// signal with nothing to serve.
func TestRunStartFailsWhenTheAddressIsInUse(t *testing.T) {
	t.Parallel()

	var listenConfig net.ListenConfig

	occupied, err := listenConfig.ListenPacket(t.Context(), "udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("occupy a UDP port: %v", err)
	}

	t.Cleanup(func() {
		_ = occupied.Close() // the test is over; a close error changes nothing
	})

	args := []string{
		"--listen", occupied.LocalAddr().String(),
		"--data-dir", t.TempDir(),
		"--log-level", "ERROR",
	}

	exitCode := make(chan int, 1)

	go func() {
		exitCode <- runStart(args)
	}()

	select {
	case code := <-exitCode:
		if code != 1 {
			t.Errorf("runStart() = %d, want 1", code)
		}
	case <-time.After(30 * time.Second):
		t.Fatal("runStart() was still running 30s after its start failed")
	}
}

func TestSplitList(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		value string
		want  []string
	}{
		{name: "empty", value: "", want: nil},
		{name: "one origin", value: "https://app.example.com", want: []string{"https://app.example.com"}},
		{
			name:  "spaces and empty items",
			value: " https://a.example.com, ,https://b.example.com ,",
			want:  []string{"https://a.example.com", "https://b.example.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if got := splitList(tt.value); !slices.Equal(got, tt.want) {
				t.Errorf("splitList(%q) = %q, want %q", tt.value, got, tt.want)
			}
		})
	}
}
