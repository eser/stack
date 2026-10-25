// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import "testing"

// A spinner draws its first frame only when the work outlasts one interval,
// so two runs of one step can differ by frames; normalize drops them.
func TestNormalizeDropsSpinnerFrames(t *testing.T) {
	t.Parallel()

	cleared := "\r                             \r"
	done := "◇  1 provider(s) detected\n"
	want := "│\n" + cleared + done

	for _, text := range []string{
		"│\n" + cleared + done,
		"│\n\r\x1b[36m⠋\x1b[39m Detecting AI providers..." + cleared + done,
		"│\n\r⠋ Detecting AI providers...\r⠙ Detecting AI providers..." + cleared + done,
	} {
		if got := normalize(text, map[string]string{}); got != want {
			t.Errorf("normalize(%q) = %q, want %q", text, got, want)
		}
	}
}
