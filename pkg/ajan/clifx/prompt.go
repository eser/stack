// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package clifx

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"charm.land/huh/v2"
	"github.com/charmbracelet/colorprofile"
)

var (
	// ErrPromptAborted is returned when the user cancels a prompt (Ctrl+C or
	// Esc in the terminal UI).
	ErrPromptAborted = errors.New("prompt aborted")
	// ErrPromptTimeout is returned when a prompt with a Timeout gets no answer
	// in time.
	ErrPromptTimeout = errors.New("prompt timed out")
)

// Clock is the time source for prompt timeouts.
type Clock interface {
	After(d time.Duration) <-chan time.Time
}

// SystemClock is the wall clock.
type SystemClock struct{}

// After waits for d on the wall clock.
func (SystemClock) After(d time.Duration) <-chan time.Time { return time.After(d) }

// Prompter asks questions on In and Out. With Accessible set it uses huh's
// line-based mode: each question is printed and answered with one line, which
// suits screen readers, pipes and tests. Otherwise it draws huh's terminal UI,
// which needs In and Out to be a terminal.
//
// Output goes through colorprofile, so styling is dropped when Out is not a
// color terminal (Env holds the environment it reads, such as os.Environ()).
// In accessible mode a prompt that times out leaves its read pending until In
// delivers a line or closes.
type Prompter struct {
	In         io.Reader
	Out        io.Writer
	Env        []string
	Clock      Clock
	Accessible bool

	lines *lineReader
}

// Option is one choice of a Select or MultiSelect.
type Option struct {
	Label string
	Value string
}

// ConfirmOptions configures Confirm.
type ConfirmOptions struct {
	Title       string
	Description string
	Affirmative string // defaults to "Yes"
	Negative    string // defaults to "No"
	Default     bool
	Timeout     time.Duration
}

// SelectOptions configures Select.
type SelectOptions struct {
	Title       string
	Description string
	Options     []Option
	Default     string // the Value preselected
	Timeout     time.Duration
}

// MultiSelectOptions configures MultiSelect.
type MultiSelectOptions struct {
	Title       string
	Description string
	Options     []Option
	Defaults    []string // the Values preselected
	Limit       int      // 0 means no limit
	Timeout     time.Duration
}

// TextOptions configures Text.
type TextOptions struct {
	Title       string
	Description string
	Placeholder string
	Default     string
	Validate    func(string) error
	Timeout     time.Duration
}

// Confirm asks a yes or no question.
func (p *Prompter) Confirm(ctx context.Context, opts *ConfirmOptions) (bool, error) {
	value := opts.Default

	field := huh.NewConfirm().Title(opts.Title).Description(opts.Description).Value(&value)
	if opts.Affirmative != "" || opts.Negative != "" {
		field = field.Affirmative(orDefault(opts.Affirmative, "Yes")).Negative(orDefault(opts.Negative, "No"))
	}

	if err := p.run(ctx, field, opts.Timeout); err != nil {
		return false, err
	}

	return value, nil
}

// Select asks for one of the options and returns its Value.
func (p *Prompter) Select(ctx context.Context, opts *SelectOptions) (string, error) {
	if len(opts.Options) == 0 {
		return "", fmt.Errorf("select %q: %w", opts.Title, errNoOptions)
	}

	value := opts.Default

	field := huh.NewSelect[string]().Title(opts.Title).Description(opts.Description).
		Options(huhOptions(opts.Options, nil)...).Value(&value)

	if err := p.run(ctx, field, opts.Timeout); err != nil {
		return "", err
	}

	return value, nil
}

// MultiSelect asks for any number of the options (up to Limit) and returns
// their Values in option order.
func (p *Prompter) MultiSelect(ctx context.Context, opts *MultiSelectOptions) ([]string, error) {
	if len(opts.Options) == 0 {
		return nil, fmt.Errorf("multiselect %q: %w", opts.Title, errNoOptions)
	}

	value := append([]string(nil), opts.Defaults...)

	field := huh.NewMultiSelect[string]().Title(opts.Title).Description(opts.Description).
		Options(huhOptions(opts.Options, opts.Defaults)...).Value(&value)
	if opts.Limit > 0 {
		field = field.Limit(opts.Limit)
	}

	if err := p.run(ctx, field, opts.Timeout); err != nil {
		return nil, err
	}

	ordered := make([]string, 0, len(value))

	for _, option := range opts.Options {
		for _, chosen := range value {
			if chosen == option.Value {
				ordered = append(ordered, chosen)

				break
			}
		}
	}

	return ordered, nil
}

// Text asks for one line of text.
func (p *Prompter) Text(ctx context.Context, opts *TextOptions) (string, error) {
	value := opts.Default

	field := huh.NewInput().Title(opts.Title).Description(opts.Description).
		Placeholder(opts.Placeholder).Value(&value)
	if opts.Validate != nil {
		field = field.Validate(opts.Validate)
	}

	if err := p.run(ctx, field, opts.Timeout); err != nil {
		return "", err
	}

	return value, nil
}

var errNoOptions = errors.New("no options to choose from")

func orDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}

	return value
}

func huhOptions(options []Option, selected []string) []huh.Option[string] {
	out := make([]huh.Option[string], 0, len(options))

	for _, option := range options {
		item := huh.NewOption(option.Label, option.Value)

		for _, value := range selected {
			if value == option.Value {
				item = item.Selected(true)
			}
		}

		out = append(out, item)
	}

	return out
}

// run asks one field and maps huh's errors to the prompt errors.
func (p *Prompter) run(ctx context.Context, field huh.Field, timeout time.Duration) error {
	input := p.In
	if p.Accessible {
		// huh reads each accessible answer through its own scanner, which
		// would buffer the next answers away; one line per Read keeps them.
		if p.lines == nil {
			p.lines = &lineReader{r: bufio.NewReader(p.In)} //nolint:exhaustruct
		}

		input = p.lines
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	form := huh.NewForm(huh.NewGroup(field)).
		WithInput(input).
		WithOutput(colorprofile.NewWriter(p.Out, p.Env)).
		WithAccessible(p.Accessible).
		WithShowHelp(!p.Accessible)

	done := make(chan error, 1)

	go func() { done <- form.RunWithContext(runCtx) }()

	var timedOut <-chan time.Time
	if timeout > 0 {
		clock := p.Clock
		if clock == nil {
			clock = SystemClock{}
		}

		timedOut = clock.After(timeout)
	}

	select {
	case err := <-done:
		return mapPromptError(err)
	case <-timedOut:
		return ErrPromptTimeout
	case <-ctx.Done():
		return ctx.Err()
	}
}

func mapPromptError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, huh.ErrUserAborted):
		return ErrPromptAborted
	case errors.Is(err, huh.ErrTimeout):
		return ErrPromptTimeout
	default:
		return fmt.Errorf("prompt: %w", err)
	}
}

// lineReader hands out at most one line per Read.
type lineReader struct {
	r       *bufio.Reader
	pending []byte
}

func (l *lineReader) Read(buf []byte) (int, error) {
	if len(l.pending) == 0 {
		line, err := l.r.ReadBytes('\n')
		if len(line) == 0 {
			return 0, err //nolint:wrapcheck // io.EOF must reach the scanner as is
		}

		l.pending = line
	}

	n := copy(buf, l.pending)
	l.pending = l.pending[n:]

	return n, nil
}
