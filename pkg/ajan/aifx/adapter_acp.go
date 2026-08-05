package aifx

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"sync"

	"github.com/eser/stack/pkg/ajan/acpfx"
	"github.com/eser/stack/pkg/ajan/acpfx/shim"
)

// ErrACPFailed wraps failures from an ACP agent session.
var ErrACPFailed = errors.New("acp agent failed")

// acpBackendProperty lets a config target override which vendor the shim drives
// without adding a provider. Rarely needed: the provider name already selects it.
const acpBackendProperty = "acpBackend"

// Provider names served by the ACP path.
const (
	claudeCodeProviderName = "claude-code"
	kiroProviderName       = "kiro"
	openCodeProviderName   = "opencode"
)

// acpModelFactory builds LanguageModels backed by an ACP agent session.
//
// # Why these providers are here at all
//
// A coding agent is not a completion model: it holds a session, asks
// permission, and edits files. LanguageModel describes none of that, which is
// why the CLI adapters this replaces re-sent the entire conversation as one
// text blob on every call and never passed --resume. The honest home for them
// is the WorkerHandle seam, where sessions and permissions exist.
//
// They stay reachable here anyway because removing them would not be a
// refactor, it would be an outage: the registry is string-keyed, so
// AddModel("kiro") does not fail to compile when the factory disappears -- it
// fails at runtime, in whatever called it, with ErrUnsupportedProvider. The FFI
// bridge passes the provider straight through from TypeScript, and the TS side
// advertises all three.
//
// So this is a thin one-shot view of an ACP session: one prompt, one answer, no
// session plumbing leaking into the interface. If it ever starts growing
// resume, permissions or tool round-trips, that is the signal to stop and move
// the caller to Seam A instead of widening this.
type acpModelFactory struct {
	provider string
	backend  string
}

// NewClaudeCodeModelFactory returns a ProviderFactory driving the Claude Code
// CLI over ACP.
func NewClaudeCodeModelFactory() ProviderFactory { //nolint:ireturn
	return &acpModelFactory{provider: claudeCodeProviderName, backend: claudeCodeProviderName}
}

// NewKiroModelFactory returns a ProviderFactory driving the Kiro CLI over ACP.
func NewKiroModelFactory() ProviderFactory { //nolint:ireturn
	return &acpModelFactory{provider: kiroProviderName, backend: kiroProviderName}
}

// NewOpenCodeModelFactory returns a ProviderFactory driving the OpenCode CLI
// over ACP.
func NewOpenCodeModelFactory() ProviderFactory { //nolint:ireturn
	return &acpModelFactory{provider: openCodeProviderName, backend: openCodeProviderName}
}

func (f *acpModelFactory) GetProvider() string { return f.provider }

func (f *acpModelFactory) CreateModel(
	_ context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	// binPath now names the VENDOR binary (claude, kiro, opencode), not a shim.
	//
	// It used to resolve `eser-acp` here and fail the whole CreateModel when that
	// binary was absent. There is no shim binary any more -- it is linked in --
	// so there is nothing to resolve, and empty means "let the backend use its
	// own default name". A missing vendor CLI now surfaces at spawn time, from
	// the process that actually tried to run it, which is where the useful error
	// text comes from anyway.
	command, _ := config.Properties["binPath"].(string)

	backend := f.backend
	if override, ok := config.Properties[acpBackendProperty].(string); ok && override != "" {
		backend = override
	}

	return &ACPModel{
		config:  config,
		command: command,
		backend: backend,
	}, nil
}

// ACPModel is a LanguageModel served by an ACP agent.
//
// Each call runs its own agent process and its own session. That is not a
// performance oversight: LanguageModel has no place to keep a session, and
// pretending otherwise -- caching an agent between calls keyed on nothing --
// would make two unrelated callers share a conversation.
type ACPModel struct {
	config  *ConfigTarget
	command string
	backend string
}

func (m *ACPModel) GetCapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
		// Tool calling is genuine here where it was not before: an ACP agent
		// streams tool_call updates, and the claude-code backend maps them.
		CapabilityToolCalling,
	}
}

func (m *ACPModel) GetProvider() string { return m.config.Provider }
func (m *ACPModel) GetModelID() string  { return m.config.Model }
func (m *ACPModel) GetRawClient() any   { return nil }

func (m *ACPModel) Close(_ context.Context) error { return nil }

// spawnArgs builds the shim invocation.
//
// The vendor flags the deleted CLI adapters modelled are carried through here
// rather than dropped: --max-turns and --allowed-tools were config properties
// callers already set, and silently ignoring them would look like the setting
// had no effect rather than like it was unsupported.
func (m *ACPModel) vendorArgs() []string {
	args := stringSliceProperty(m.config.Properties, "args")

	if m.config.Model != "" {
		args = append([]string{"--model", m.config.Model}, args...)
	}

	if maxTurns := intProperty(m.config.Properties, "maxTurns"); maxTurns > 0 {
		args = append(args, "--max-turns", strconv.Itoa(maxTurns))
	}

	if allowed := stringSliceProperty(m.config.Properties, "allowedTools"); len(allowed) > 0 {
		args = append(args, "--allowedTools", strings.Join(allowed, ","))
	}

	return args
}

// acpShimVersion is what the in-process shim reports in its initialize
// response. It is our own code, so there is no separate binary to version.
const acpShimVersion = "1"

// backendImpl builds the vendor backend this model drives.
//
// This is what `eser-acp --backend <name> --command <path> ...` used to do by
// parsing flags; the flags existed only to carry these three values across a
// process boundary that no longer exists.
func (m *ACPModel) backendImpl() (shim.Backend, error) { //nolint:ireturn
	args := m.vendorArgs()

	switch m.backend {
	case claudeCodeProviderName:
		return &shim.ClaudeCode{Command: m.command, ExtraArgs: args}, nil
	case kiroProviderName:
		return &shim.Kiro{Command: m.command, ExtraArgs: args}, nil //nolint:exhaustruct
	case openCodeProviderName:
		return &shim.OpenCode{Command: m.command, ExtraArgs: args}, nil //nolint:exhaustruct
	default:
		return nil, fmt.Errorf("%w: unknown backend %q", ErrACPFailed, m.backend)
	}
}

// stringSliceProperty reads a list-of-strings config property.
//
// It accepts []any as well as []string because that is what config decoding
// actually produces: a YAML or JSON list arrives as []any, so the []string
// assertion the deleted CLI adapters used never matched and every extra arg a
// user configured was silently discarded.
func stringSliceProperty(properties map[string]any, name string) []string {
	switch value := properties[name].(type) {
	case []string:
		return slices.Clone(value)

	case []any:
		out := make([]string, 0, len(value))

		for _, item := range value {
			if text, ok := item.(string); ok {
				out = append(out, text)
			}
		}

		return out

	default:
		return nil
	}
}

// intProperty reads a numeric config property.
//
// float64 is listed because JSON decoding produces it for every number.
func intProperty(properties map[string]any, name string) int {
	switch value := properties[name].(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	default:
		return 0
	}
}

// GenerateText runs one turn and returns everything the agent said.
func (m *ACPModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	collector := &acpCollector{} //nolint:exhaustruct

	stop, err := m.runTurn(ctx, opts, collector)
	if err != nil {
		return nil, err
	}

	content := collector.content()

	return &GenerateTextResult{ //nolint:exhaustruct
		Content:    content,
		StopReason: stop,
		ModelID:    m.config.Model,
	}, nil
}

// StreamText runs one turn, emitting each update as it arrives.
func (m *ACPModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, streamBufferSize)

	go func() {
		defer close(eventCh)
		defer cancel()

		emitter := &acpEmitter{ctx: streamCtx, events: eventCh}

		stop, err := m.runTurn(streamCtx, opts, emitter)
		if err != nil {
			sendStreamEvent(streamCtx, eventCh, newStreamEventError(err))

			return
		}

		sendStreamEvent(
			streamCtx, eventCh, newStreamEventDone(stop, &Usage{}), //nolint:exhaustruct
		)
	}()

	return NewStreamIterator(eventCh, cancel), nil
}

// streamBufferSize matches the depth the other streaming adapters use.
const streamBufferSize = 64

// acpSink receives the updates of one turn.
type acpSink interface {
	text(delta string)
	toolCall(call *ToolCall)
}

// runTurn spawns an agent, runs one prompt, and feeds updates to sink.
func (m *ACPModel) runTurn(
	ctx context.Context,
	opts *GenerateTextOptions,
	sink acpSink,
) (StopReason, error) {
	handler := &acpClientHandler{sink: sink}

	// The shim runs in this process, not as a subprocess.
	//
	// It is our own Go code (pkg/ajan/acpfx/shim) compiled into this binary, so
	// spawning it meant serialising JSON down a pipe to reach a struct already
	// in memory -- and paying for a separate `eser-acp` executable to be built,
	// shipped, installed, put on PATH and probed for. acpfx.Spawn remains the
	// entry point for agents that genuinely are other programs.
	backend, err := m.backendImpl()
	if err != nil {
		return "", err
	}

	client, err := acpfx.InProcess(ctx, shim.New(backend, acpShimVersion), handler,
		&acpfx.Implementation{
			Name: "aifx", Title: "aifx", Version: "1",
		})
	if err != nil {
		return "", fmt.Errorf("%w: %s: %w", ErrACPFailed, m.backend, err)
	}

	defer func() { _ = client.Close() }()

	session, err := client.NewSession(ctx, &acpfx.NewSessionRequest{ //nolint:exhaustruct
		Cwd: m.workingDirectory(),
	})
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrACPFailed, err)
	}

	// The whole conversation goes in one turn. An ACP session could carry it
	// across turns instead, but GenerateText is handed the full history on every
	// call and has nowhere to record that a session already exists.
	prompt := FormatMessagesAsText(opts.Messages, opts.System)

	resp, err := session.Prompt(ctx, []acpfx.ContentBlock{acpfx.TextBlock(prompt)})
	if err != nil {
		return "", fmt.Errorf("%w: %w", ErrACPFailed, err)
	}

	return mapACPStopReason(resp.StopReason), nil
}

// workingDirectory is where the agent runs.
//
// A coding agent is scoped to a directory, and the config has a place to say
// which. Empty means the process's own cwd, which is what every CLI adapter
// this replaces did implicitly.
func (m *ACPModel) workingDirectory() string {
	if cwd, ok := m.config.Properties["cwd"].(string); ok {
		return cwd
	}

	return ""
}

// mapACPStopReason translates ACP's stop reasons to aifx's.
//
// refusal and cancelled have no aifx analogue, so they map to the nearest true
// statement rather than being invented: both mean the turn stopped early.
func mapACPStopReason(reason acpfx.StopReason) StopReason {
	switch reason {
	case acpfx.StopReasonEndTurn:
		return StopReasonEndTurn
	case acpfx.StopReasonMaxTokens:
		return StopReasonMaxTokens
	case acpfx.StopReasonMaxTurnRequests:
		return StopReasonEndTurn
	case acpfx.StopReasonRefusal, acpfx.StopReasonCancelled:
		return StopReasonEndTurn
	default:
		return StopReasonEndTurn
	}
}

// acpClientHandler serves the client half for a one-shot turn.
type acpClientHandler struct {
	sink acpSink
}

// RequestPermission denies every request.
//
// There is no user here: GenerateText is a function call, not a session with
// someone watching it. Cancelling is the only honest answer -- an automatic
// allow would let a caller that asked for text quietly authorise file writes.
func (h *acpClientHandler) RequestPermission(
	_ context.Context,
	_ *acpfx.RequestPermissionRequest,
) (acpfx.PermissionOutcome, error) {
	return acpfx.CancelPermission(), nil
}

func (h *acpClientHandler) SessionUpdate(_ context.Context, note *acpfx.SessionNotification) {
	switch note.Update.SessionUpdate {
	case acpfx.UpdateAgentMessageChunk:
		if note.Update.Content != nil {
			h.sink.text(note.Update.Content.Text)
		}

	case acpfx.UpdateToolCall:
		if call := note.Update.ToolCall; call != nil {
			h.sink.toolCall(&ToolCall{
				ID:        call.ToolCallID,
				Name:      call.Title,
				Arguments: call.RawInput,
			})
		}

	default:
		// Thoughts, plans, mode changes and tool-call updates carry no text a
		// LanguageModel caller asked for. Dropped deliberately: folding a thought
		// into the answer is how a chain of reasoning ends up presented as a
		// result.
	}
}

// acpCollector accumulates a whole turn for GenerateText.
type acpCollector struct {
	mu     sync.Mutex
	answer strings.Builder
	calls  []*ToolCall
}

func (c *acpCollector) text(delta string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.answer.WriteString(delta)
}

func (c *acpCollector) toolCall(call *ToolCall) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.calls = append(c.calls, call)
}

func (c *acpCollector) content() []ContentBlock {
	c.mu.Lock()
	defer c.mu.Unlock()

	blocks := make([]ContentBlock, 0, 1+len(c.calls))

	if text := c.answer.String(); text != "" {
		blocks = append(blocks, ContentBlock{ //nolint:exhaustruct
			Type: ContentBlockText,
			Text: text,
		})
	}

	for _, call := range c.calls {
		blocks = append(blocks, ContentBlock{ //nolint:exhaustruct
			Type:     ContentBlockToolCall,
			ToolCall: call,
		})
	}

	return blocks
}

// acpEmitter forwards updates to a stream as they arrive.
type acpEmitter struct {
	ctx    context.Context //nolint:containedctx
	events chan<- StreamEvent
}

func (e *acpEmitter) text(delta string) {
	sendStreamEvent(e.ctx, e.events, newStreamEventContentDelta(delta))
}

func (e *acpEmitter) toolCall(call *ToolCall) {
	sendStreamEvent(e.ctx, e.events, newStreamEventToolCall(call))
}

// Compile-time interface assertions.
var (
	_ ProviderFactory     = (*acpModelFactory)(nil)
	_ LanguageModel       = (*ACPModel)(nil)
	_ acpfx.ClientHandler = (*acpClientHandler)(nil)
	_ acpSink             = (*acpCollector)(nil)
	_ acpSink             = (*acpEmitter)(nil)
)
