package aifx

import (
	"context"
	"strings"
	"testing"
)

// TestMissingShimErrorIsActionable pins that the failure tells the user what to
// do, not just what is absent.
//
// The bare resolver error is `binary not found: "eser-acp" not found on PATH`.
// It names a binary most users have never heard of, does not say where it comes
// from, and — the part that sends someone round the loop twice — does not
// mention that the shim only translates ACP to a vendor CLI which must ALSO be
// installed.
func TestMissingShimErrorIsActionable(t *testing.T) {
	// An empty PATH, so the shim is unresolvable on every machine. Skipping when
	// it happens to be installed would make this vacuous exactly where the
	// feature is already working, which is the wrong half to cover.
	t.Setenv("PATH", t.TempDir())

	_, err := NewClaudeCodeModelFactory().CreateModel(
		context.Background(),
		&ConfigTarget{ //nolint:exhaustruct
			Provider: "claude-code",
			Model:    "claude-test",
		},
	)
	if err == nil {
		t.Fatal("a missing shim was not reported at all")
	}

	message := err.Error()

	for _, want := range []string{
		"eser-acp",  // what is missing
		"eserstack", // where it comes from
		"claude",    // the vendor CLI it drives
		"binPath",   // the override this caller honours
	} {
		if !strings.Contains(message, want) {
			t.Fatalf("error %q does not mention %q", message, want)
		}
	}
}
