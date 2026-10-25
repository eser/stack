// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package clifx_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/clifx"
)

var choices = []clifx.Option{{Label: "Alpha", Value: "a"}, {Label: "Beta", Value: "b"}, {Label: "Gamma", Value: "c"}}

// keys is a fake terminal's keyboard: it delivers the key sequences in order
// through a pipe, as a terminal delivers keystrokes.
func keys(t *testing.T, seq ...string) io.Reader {
	t.Helper()

	r, w := io.Pipe()

	go func() {
		for _, k := range seq {
			if _, err := w.Write([]byte(k)); err != nil {
				return
			}
		}
	}()

	t.Cleanup(func() { _ = w.Close() })

	return r
}

type promptCase struct {
	name string
	ask  func(ctx context.Context, p *clifx.Prompter) (any, error)
	// lines answers the accessible mode; keys drives the terminal UI.
	lines string
	keys  []string
	want  any
	// shown is text the accessible mode must print.
	shown string
}

func promptCases() []promptCase {
	confirm := func(ctx context.Context, p *clifx.Prompter) (any, error) {
		return p.Confirm(ctx, &clifx.ConfirmOptions{Title: "Deploy?"}) //nolint:exhaustruct
	}

	return []promptCase{
		{name: "confirm yes", ask: confirm, lines: "y\n", keys: []string{"y"}, want: true, shown: "Deploy? [y/N]"},
		{name: "confirm no", ask: confirm, lines: "n\n", keys: []string{"n"}, want: false, shown: "Deploy? [y/N]"},
		{
			name: "confirm default",
			ask: func(ctx context.Context, p *clifx.Prompter) (any, error) {
				return p.Confirm(ctx, &clifx.ConfirmOptions{Title: "Deploy?", Default: true}) //nolint:exhaustruct
			},
			lines: "\n", keys: []string{"\r"}, want: true, shown: "Deploy? [Y/n]",
		},
		{
			name: "select",
			ask: func(ctx context.Context, p *clifx.Prompter) (any, error) {
				return p.Select(ctx, &clifx.SelectOptions{Title: "Pick one", Options: choices}) //nolint:exhaustruct
			},
			lines: "2\n", keys: []string{"j", "\r"}, want: "b", shown: "2. Beta",
		},
		{
			name: "select with a default",
			ask: func(ctx context.Context, p *clifx.Prompter) (any, error) {
				return p.Select(ctx, &clifx.SelectOptions{Title: "Pick one", Options: choices, Default: "c"}) //nolint:exhaustruct
			},
			lines: "\n", keys: []string{"\r"}, want: "c", shown: "3. Gamma",
		},
		{
			name: "multiselect",
			ask: func(ctx context.Context, p *clifx.Prompter) (any, error) {
				return p.MultiSelect(ctx, &clifx.MultiSelectOptions{Title: "Pick some", Options: choices}) //nolint:exhaustruct
			},
			lines: "3\n1\n0\n", keys: []string{" ", "j", "j", " ", "\r"}, want: []string{"a", "c"}, shown: "0.   Confirm selection",
		},
		{
			name: "multiselect with defaults",
			ask: func(ctx context.Context, p *clifx.Prompter) (any, error) {
				return p.MultiSelect(ctx, &clifx.MultiSelectOptions{Title: "Pick some", Options: choices, Defaults: []string{"b"}}) //nolint:exhaustruct
			},
			lines: "0\n", keys: []string{"\r"}, want: []string{"b"}, shown: "2. ✓ Beta",
		},
		{
			name: "text",
			ask: func(ctx context.Context, p *clifx.Prompter) (any, error) {
				return p.Text(ctx, &clifx.TextOptions{Title: "Name"}) //nolint:exhaustruct
			},
			lines: "ada\n", keys: []string{"a", "d", "a", "\r"}, want: "ada", shown: "Name",
		},
		{
			name: "text with a validator",
			ask: func(ctx context.Context, p *clifx.Prompter) (any, error) {
				return p.Text(ctx, &clifx.TextOptions{ //nolint:exhaustruct
					Title: "Port",
					Validate: func(s string) error {
						if strings.Trim(s, "0123456789") != "" || s == "" {
							return errors.New("digits only")
						}

						return nil
					},
				})
			},
			lines: "x\n80\n", keys: []string{"8", "0", "\r"}, want: "80", shown: "digits only",
		},
	}
}

func TestPromptsAccessible(t *testing.T) {
	t.Parallel()

	for _, tc := range promptCases() {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var out bytes.Buffer

			p := &clifx.Prompter{In: strings.NewReader(tc.lines), Out: &out, Accessible: true} //nolint:exhaustruct

			got, err := tc.ask(context.Background(), p)
			if err != nil {
				t.Fatal(err)
			}

			if !equal(got, tc.want) {
				t.Errorf("answer %v, want %v", got, tc.want)
			}

			if !strings.Contains(out.String(), tc.shown) {
				t.Errorf("output should show %q:\n%s", tc.shown, out.String())
			}

			if strings.Contains(out.String(), "\x1b[") {
				t.Errorf("output to a non-terminal should carry no escape codes: %q", out.String())
			}
		})
	}
}

func TestPromptsTerminalUI(t *testing.T) {
	t.Parallel()

	for _, tc := range promptCases() {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()

			p := &clifx.Prompter{In: keys(t, tc.keys...), Out: io.Discard} //nolint:exhaustruct

			got, err := tc.ask(ctx, p)
			if err != nil {
				t.Fatal(err)
			}

			if !equal(got, tc.want) {
				t.Errorf("answer %v, want %v", got, tc.want)
			}
		})
	}
}

func TestPromptsSeveralOnOneInput(t *testing.T) {
	t.Parallel()

	p := &clifx.Prompter{In: strings.NewReader("y\n3\nada\n"), Out: io.Discard, Accessible: true} //nolint:exhaustruct
	ctx := context.Background()

	ok, err1 := p.Confirm(ctx, &clifx.ConfirmOptions{Title: "Go?"})                    //nolint:exhaustruct
	pick, err2 := p.Select(ctx, &clifx.SelectOptions{Title: "Pick", Options: choices}) //nolint:exhaustruct
	name, err3 := p.Text(ctx, &clifx.TextOptions{Title: "Name"})                       //nolint:exhaustruct

	if err := errors.Join(err1, err2, err3); err != nil || !ok || pick != "c" || name != "ada" {
		t.Errorf("got %v %q %q, %v", ok, pick, name, err)
	}
}

// fakeClock fires its timers when the test says so.
type fakeClock struct{ fire chan time.Time }

func (c *fakeClock) After(time.Duration) <-chan time.Time { return c.fire }

func TestPromptTimeoutAndAbort(t *testing.T) {
	t.Parallel()

	t.Run("timeout on the injected clock", func(t *testing.T) {
		t.Parallel()

		clock := &fakeClock{fire: make(chan time.Time, 1)}
		clock.fire <- time.Time{}

		p := &clifx.Prompter{In: keys(t), Out: io.Discard, Clock: clock} //nolint:exhaustruct

		_, err := p.Confirm(context.Background(), &clifx.ConfirmOptions{Title: "Go?", Timeout: time.Hour}) //nolint:exhaustruct
		if !errors.Is(err, clifx.ErrPromptTimeout) {
			t.Errorf("expected ErrPromptTimeout, got %v", err)
		}
	})

	t.Run("ctrl+c aborts", func(t *testing.T) {
		t.Parallel()

		p := &clifx.Prompter{In: keys(t, "\x03"), Out: io.Discard} //nolint:exhaustruct

		_, err := p.Select(context.Background(), &clifx.SelectOptions{Title: "Pick", Options: choices}) //nolint:exhaustruct
		if !errors.Is(err, clifx.ErrPromptAborted) {
			t.Errorf("expected ErrPromptAborted, got %v", err)
		}
	})

	t.Run("no options", func(t *testing.T) {
		t.Parallel()

		p := &clifx.Prompter{In: strings.NewReader(""), Out: io.Discard, Accessible: true} //nolint:exhaustruct

		if _, err := p.Select(context.Background(), &clifx.SelectOptions{Title: "Pick"}); err == nil { //nolint:exhaustruct
			t.Error("a select without options should fail")
		}
	})
}

func equal(a, b any) bool {
	as, aok := a.([]string)
	bs, bok := b.([]string)

	if aok && bok {
		return strings.Join(as, ",") == strings.Join(bs, ",")
	}

	return a == b
}
