// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"text/tabwriter"
	"time"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/clifx"
)

// defaultOllamaURL is where ollama listens unless configured otherwise.
const defaultOllamaURL = "http://localhost:11434"

var errNoProvider = errors.New("no AI provider detected. Install claude, ollama, or set " +
	"ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / OPENAI_API_KEY")

// aiProvider is one row of the provider table: its name, short alias, kind,
// display name and default model.
type aiProvider struct {
	name, alias, kind, display, model string
}

// aiProviders is the table of the TypeScript ai package (commands/ask.ts and
// detect.ts), in its order.
var aiProviders = []aiProvider{ //nolint:gochecknoglobals
	{name: "claude-code", alias: "cc", kind: "CLI", display: "Claude Code", model: "claude-sonnet-5"},
	{name: "ollama", alias: "ol", kind: "HTTP", display: "Ollama", model: "llama3"},
	{name: "opencode", alias: "oc", kind: "CLI", display: "OpenCode", model: "default"},
	{name: "kiro", alias: "kr", kind: "CLI", display: "Kiro", model: "default"},
	{name: "anthropic", alias: "ant", kind: "API", display: "Anthropic API", model: "claude-sonnet-5"},
	{name: "openai", alias: "oai", kind: "API", display: "OpenAI API", model: "gpt-5.6-terra"},
	{name: "gemini", alias: "gem", kind: "API", display: "Gemini API", model: "gemini-3.6-flash"},
	{name: "vertexai", alias: "vtx", kind: "API", display: "Vertex AI", model: "gemini-3.6-flash"},
}

func findProvider(nameOrAlias string) (aiProvider, bool) {
	for _, p := range aiProviders {
		if p.name == nameOrAlias || p.alias == nameOrAlias {
			return p, true
		}
	}

	return aiProvider{}, false //nolint:exhaustruct
}

// hasEnv reports whether a variable is set, even to "", as the TypeScript
// env.has does.
func (e *env) hasEnv(name string) bool {
	prefix := name + "="

	for _, entry := range e.environ() {
		if strings.HasPrefix(entry, prefix) {
			return true
		}
	}

	return false
}

func (e *env) hasBinary(name string) bool {
	_, err := e.lookPath(name)

	return err == nil
}

// ollamaReachable asks ollama for its version, waiting at most a second.
func (e *env) ollamaReachable(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, e.ollamaBaseURL()+"/api/version", nil)
	if err != nil {
		return false
	}

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return false
	}

	_ = resp.Body.Close()

	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func (e *env) ollamaBaseURL() string {
	if e.ollamaURL != "" {
		return e.ollamaURL
	}

	return defaultOllamaURL
}

// providerStatus is one detected provider for `eser ai list`.
type providerStatus struct {
	Name      string `json:"name"`
	Alias     string `json:"alias"`
	Type      string `json:"type"`
	Available bool   `json:"available"`
	Detail    string `json:"detail"`
}

func (e *env) detectProviders(ctx context.Context) []providerStatus {
	binary := func(p aiProvider) providerStatus {
		bin := map[string]string{"claude-code": "claude", "opencode": "opencode", "kiro": "kiro"}[p.name]
		ok := e.hasBinary(bin)

		detail := bin + " not on PATH"
		if ok {
			detail = bin + " binary found"
		}

		return providerStatus{Name: p.name, Alias: p.alias, Type: p.kind, Available: ok, Detail: detail}
	}

	statuses := make([]providerStatus, 0, len(aiProviders))

	for _, p := range aiProviders {
		status := providerStatus{Name: p.name, Alias: p.alias, Type: p.kind} //nolint:exhaustruct

		switch p.name {
		case "claude-code", "opencode", "kiro":
			status = binary(p)
		case "ollama":
			status.Available = e.ollamaReachable(ctx)
			status.Detail = "localhost:11434 not reachable"

			if status.Available {
				status.Detail = "localhost:11434 reachable"
			}
		case "anthropic":
			status.Available = e.hasEnv("ANTHROPIC_API_KEY") || e.hasEnv("ANTHROPIC_AUTH_TOKEN")

			switch {
			case e.hasEnv("ANTHROPIC_API_KEY"):
				status.Detail = "ANTHROPIC_API_KEY set"
			case e.hasEnv("ANTHROPIC_AUTH_TOKEN"):
				status.Detail = "ANTHROPIC_AUTH_TOKEN set"
			default:
				status.Detail = "ANTHROPIC_API_KEY not set"
			}
		case "openai":
			status.Available = e.hasEnv("OPENAI_API_KEY")
			status.Detail = map[bool]string{true: "OPENAI_API_KEY set", false: "OPENAI_API_KEY not set"}[status.Available]
		case "gemini":
			status.Available = e.hasEnv("GEMINI_API_KEY") || e.hasEnv("GOOGLE_API_KEY")
			status.Detail = map[bool]string{true: "API key set", false: "GEMINI_API_KEY not set"}[status.Available]
		case "vertexai":
			status.Available = e.hasEnv("GOOGLE_CLOUD_PROJECT")
			status.Detail = map[bool]string{true: "GOOGLE_CLOUD_PROJECT set", false: "GOOGLE_CLOUD_PROJECT not set"}[status.Available]
		}

		statuses = append(statuses, status)
	}

	return statuses
}

// detectProvider picks the first usable provider in the TypeScript order:
// claude on PATH, a reachable ollama, opencode on PATH, then an Anthropic or
// OpenAI credential.
func (e *env) detectProvider(ctx context.Context, logf func(string, ...any)) (string, error) {
	logf("Auto-detecting AI provider...")

	switch {
	case e.hasBinary("claude"):
		logf("Claude Code detected.")

		return "claude-code", nil
	case e.ollamaReachable(ctx):
		logf("Ollama detected at localhost:11434.")

		return "ollama", nil
	case e.hasBinary("opencode"):
		logf("OpenCode detected.")

		return "opencode", nil
	case e.hasEnv("ANTHROPIC_API_KEY") || e.hasEnv("ANTHROPIC_AUTH_TOKEN"):
		logf("Anthropic API key detected.")

		return "anthropic", nil
	case e.hasEnv("OPENAI_API_KEY"):
		logf("OpenAI API key detected.")

		return "openai", nil
	}

	return "", errNoProvider
}

// newAIRegistry is the registry `eser ai ask` uses: the factories tests
// inject, or every built-in one.
func (e *env) newAIRegistry() *aifx.Registry {
	if e.aiFactories != nil {
		registry := aifx.NewRegistry()
		for _, factory := range e.aiFactories() {
			registry.RegisterFactory(factory)
		}

		return registry
	}

	return aifx.NewRegistry(aifx.WithDefaultFactories())
}

func aiCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "ai",
		Short: "Ask an AI provider, or list the providers",
		Subcommands: []*clifx.Command{
			aiAskCommand(e),
			{
				Name:  "list",
				Short: "List the AI providers and whether each is available",
				Run: func(c *clifx.Context) error {
					statuses := e.detectProviders(c)

					return c.Output(statuses, func(w io.Writer) error {
						return writeProviderTable(w, statuses)
					})
				},
			},
		},
	}
}

func writeProviderTable(w io.Writer, statuses []providerStatus) error {
	_, _ = fmt.Fprintln(w, "AI Providers")
	_, _ = fmt.Fprintln(w)

	table := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0) //nolint:mnd
	_, _ = fmt.Fprintln(table, "\tProvider\tType\tStatus")

	available := 0

	for _, s := range statuses {
		mark := "○"
		if s.Available {
			mark = "●"
			available++
		}

		_, _ = fmt.Fprintf(table, "%s\t%s (%s)\t%s\t%s\n", mark, s.Name, s.Alias, s.Type, s.Detail)
	}

	if err := table.Flush(); err != nil {
		return fmt.Errorf("write the provider table: %w", err)
	}

	_, err := fmt.Fprintf(w, "%d/%d providers available\n", available, len(statuses))

	return err //nolint:wrapcheck
}

func aiAskCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "ask",
		Short: "Send a prompt to an AI provider and stream the answer",
		Long: "Without -p, uses the first available provider: claude on PATH, ollama on localhost:11434, " +
			"opencode on PATH, then ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN or OPENAI_API_KEY. " +
			"--json waits for the whole answer and prints the result object. Ctrl-C stops the request.",
		Args: `"your prompt"`,
		Flags: func(fs *flag.FlagSet) {
			for _, names := range [][3]string{
				{"provider", "p", "provider name or alias (cc, ol, oc, kr, ant, oai, gem, vtx)"},
				{"model", "m", "model id (default: the provider's default model)"},
			} {
				value := new(string)
				fs.StringVar(value, names[0], "", names[2])
				fs.StringVar(value, names[1], "", "short for --"+names[0])
			}

			fs.String("max-tokens", "", "output token limit, a positive whole number")
			fs.String("effort", "", "effort level: low, medium, high, xhigh or max")

			verbose := new(bool)
			fs.BoolVar(verbose, "verbose", false, "log each step to stderr")
			fs.BoolVar(verbose, "v", false, "short for --verbose")
		},
		Run: func(c *clifx.Context) error {
			return runAsk(c, e)
		},
	}
}

func parseAskOptions(c *clifx.Context, prompt string) (*aifx.GenerateTextOptions, error) {
	opts := &aifx.GenerateTextOptions{ //nolint:exhaustruct
		Messages: []aifx.Message{aifx.NewTextMessage(aifx.RoleUser, prompt)},
	}

	if raw := c.String("max-tokens"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit <= 0 {
			return nil, clifx.Usagef("--max-tokens %q is not a positive whole number; pass the output token limit, "+
				"such as --max-tokens 1024", raw)
		}

		opts.MaxTokens = limit
	}

	if raw := c.String("effort"); raw != "" {
		switch effort := aifx.Effort(raw); effort {
		case aifx.EffortLow, aifx.EffortMedium, aifx.EffortHigh, aifx.EffortXHigh, aifx.EffortMax:
			opts.Effort = effort
		case aifx.EffortDefault:
		default:
			return nil, clifx.Usagef("--effort %q is not an effort level; use low, medium, high, xhigh or max", raw)
		}
	}

	return opts, nil
}

func runAsk(c *clifx.Context, e *env) error {
	prompt := strings.Join(c.Args, " ")
	if prompt == "" {
		return clifx.Usagef("give a prompt, such as eser ai ask \"what is a monad?\"")
	}

	opts, err := parseAskOptions(c, prompt)
	if err != nil {
		return err
	}

	logf := func(format string, args ...any) {
		if c.Bool("verbose") {
			_, _ = fmt.Fprintf(e.stderr, format+"\n", args...)
		}
	}

	name := c.String("provider")
	if name == "" {
		if name, err = e.detectProvider(c, logf); err != nil {
			return err
		}
	}

	provider, known := findProvider(name)
	if !known {
		provider = aiProvider{name: name, display: name, model: "default"} //nolint:exhaustruct
	}

	model := c.String("model")
	if model == "" {
		model = provider.model
	}

	logf("Using %s (%s)", provider.display, model)

	registry := e.newAIRegistry()

	defer func() { _ = registry.Close(context.WithoutCancel(c)) }()

	config := &aifx.ConfigTarget{Provider: provider.name, Model: model} //nolint:exhaustruct
	if provider.name == "ollama" {
		config.BaseURL = e.ollamaBaseURL()
	}

	lm, err := registry.AddModel(c, aifx.DefaultModel, config)
	if err != nil {
		return fmt.Errorf("%s: %w", provider.display, err)
	}

	logf("Sending prompt (%d chars)...", len(prompt))

	if c.JSON {
		result, err := lm.GenerateText(c, opts)
		if err != nil {
			return askError(c, err)
		}

		logf("Response received (%d chars)", len(result.Text()))

		data, err := json.MarshalIndent(resultJSON(result), "", "  ")
		if err != nil {
			return fmt.Errorf("encode the result: %w", err)
		}

		_, _ = fmt.Fprintln(e.stdout, string(data))

		return nil
	}

	return streamAnswer(c, e, lm, opts)
}

// streamAnswer writes the answer as it arrives, then a newline.
func streamAnswer(c *clifx.Context, e *env, lm aifx.LanguageModel, opts *aifx.GenerateTextOptions) error {
	iter, err := lm.StreamText(c, opts)
	if err != nil {
		return askError(c, err)
	}

	defer func() { _ = iter.Close() }()

	var streamErr error

	for iter.Next() {
		event := iter.Current()

		switch event.Type { //nolint:exhaustive // only text and errors reach the terminal
		case aifx.StreamEventContentDelta:
			_, _ = io.WriteString(e.stdout, event.TextDelta)
		case aifx.StreamEventError:
			streamErr = event.Error
		}
	}

	_, _ = fmt.Fprintln(e.stdout)

	if streamErr == nil {
		streamErr = iter.Err()
	}

	if streamErr != nil {
		return askError(c, streamErr)
	}

	return nil
}

// askError reports a cancelled request (Ctrl-C) with exit code 130, the
// shell's code for an interrupt; other errors pass through.
func askError(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return &clifx.ExitError{Code: 130, Err: fmt.Errorf("cancelled: %w", context.Cause(ctx))} //nolint:mnd
	}

	return err
}

// The TypeScript GenerateTextResult shape (content blocks with a kind,
// camelCase fields, its key order), as `ai ask --json` prints it.
type (
	resultWire struct {
		Content    []blockWire     `json:"content"`
		StopReason aifx.StopReason `json:"stopReason"`
		Usage      usageWire       `json:"usage"`
		ModelID    string          `json:"modelId"`
	}
	blockWire struct {
		Kind       string          `json:"kind"`
		Text       *string         `json:"text,omitempty"`
		ToolCall   *toolCallWire   `json:"toolCall,omitempty"`
		ToolResult *toolResultWire `json:"toolResult,omitempty"`
		Thinking   *thinkingWire   `json:"thinking,omitempty"`
	}
	toolCallWire struct {
		ID        string          `json:"id"`
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	toolResultWire struct {
		ToolCallID string `json:"toolCallId"`
		Content    string `json:"content"`
		IsError    bool   `json:"isError"`
	}
	thinkingWire struct {
		Text         string `json:"text"`
		Signature    string `json:"signature,omitempty"`
		RedactedData string `json:"redactedData,omitempty"`
	}
	usageWire struct {
		InputTokens    int `json:"inputTokens"`
		OutputTokens   int `json:"outputTokens"`
		TotalTokens    int `json:"totalTokens"`
		ThinkingTokens int `json:"thinkingTokens,omitempty"`
	}
)

func resultJSON(r *aifx.GenerateTextResult) resultWire {
	content := make([]blockWire, 0, len(r.Content))

	for _, b := range r.Content {
		switch b.Type { //nolint:exhaustive // the kinds a model answers with
		case aifx.ContentBlockText:
			text := b.Text
			content = append(content, blockWire{Kind: "text", Text: &text}) //nolint:exhaustruct
		case aifx.ContentBlockToolCall:
			if b.ToolCall != nil {
				arguments := b.ToolCall.Arguments
				if len(arguments) == 0 {
					arguments = json.RawMessage("{}")
				}

				content = append(content, blockWire{Kind: "tool_call", ToolCall: &toolCallWire{ //nolint:exhaustruct
					ID: b.ToolCall.ID, Name: b.ToolCall.Name, Arguments: arguments,
				}})
			}
		case aifx.ContentBlockToolResult:
			if b.ToolResult != nil {
				content = append(content, blockWire{Kind: "tool_result", ToolResult: &toolResultWire{ //nolint:exhaustruct
					ToolCallID: b.ToolResult.ToolCallID, Content: b.ToolResult.Content, IsError: false,
				}})
			}
		case aifx.ContentBlockThinking:
			if b.Thinking != nil {
				content = append(content, blockWire{Kind: "thinking", Thinking: &thinkingWire{ //nolint:exhaustruct
					Text: b.Thinking.Text, Signature: b.Thinking.Signature, RedactedData: b.Thinking.RedactedData,
				}})
			}
		}
	}

	stopReason := r.StopReason
	switch stopReason { //nolint:exhaustive // every other reason reads as "stop", as in the TypeScript mapping
	case aifx.StopReasonEndTurn, aifx.StopReasonMaxTokens, aifx.StopReasonToolUse, aifx.StopReasonRefusal:
	default:
		stopReason = aifx.StopReasonStop
	}

	return resultWire{
		Content:    content,
		StopReason: stopReason,
		Usage: usageWire{
			InputTokens: r.Usage.InputTokens, OutputTokens: r.Usage.OutputTokens,
			TotalTokens: r.Usage.TotalTokens, ThinkingTokens: r.Usage.ThinkingTokens,
		},
		ModelID: r.ModelID,
	}
}
