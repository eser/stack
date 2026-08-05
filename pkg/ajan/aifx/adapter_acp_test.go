package aifx

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/acpfx"
)

// These tests drive the real ACPModel against a real ACP agent over real OS
// pipes. The agent is this test binary re-invoked in a fake-agent mode, so the
// only thing standing in for production is the vendor behind the shim -- the
// protocol, the spawn and the translation are all the real ones.

const fakeAgentEnv = "AIFX_FAKE_ACP_AGENT"

const (
	// fakeAgentText answers with two chunks of prose.
	fakeAgentText = "text"

	// fakeAgentTool answers with a tool call as well as prose.
	fakeAgentTool = "tool"

	// fakeAgentPermission asks permission before answering, and reports what it
	// was told.
	fakeAgentPermission = "permission"

	// fakeAgentEcho answers with its own argv, so a test can see how the shim
	// was invoked.
	fakeAgentEcho = "echo"
)

// TestMain intercepts before flag parsing: the fake agent is spawned with the
// shim's flags (--backend, --model), which the testing package would reject.
func TestMain(m *testing.M) {
	if mode := os.Getenv(fakeAgentEnv); mode != "" {
		runFakeACPAgent(mode)
	}

	os.Exit(m.Run())
}

// fakeACPAgent serves the agent half of ACP on stdio.
type fakeACPAgent struct {
	conn *acpfx.Agent
	mode string
}

func (a *fakeACPAgent) Initialize(
	_ context.Context,
	req *acpfx.InitializeRequest,
) (*acpfx.InitializeResponse, error) {
	return &acpfx.InitializeResponse{ //nolint:exhaustruct
		ProtocolVersion: req.ProtocolVersion,
		AgentInfo: &acpfx.Implementation{
			Name: "fake", Title: "fake", Version: "0",
		},
	}, nil
}

func (a *fakeACPAgent) NewSession(
	_ context.Context,
	_ *acpfx.NewSessionRequest,
) (*acpfx.NewSessionResponse, error) {
	return &acpfx.NewSessionResponse{SessionID: "fake-1", Modes: nil}, nil
}

func (a *fakeACPAgent) Cancel(_ context.Context, _ *acpfx.CancelNotification) {}

func (a *fakeACPAgent) Prompt(
	ctx context.Context,
	req *acpfx.PromptRequest,
	emit acpfx.UpdateFunc,
) (*acpfx.PromptResponse, error) {
	say := func(text string) {
		_ = emit(acpfx.SessionUpdate{ //nolint:exhaustruct
			SessionUpdate: acpfx.UpdateAgentMessageChunk,
			Content: &acpfx.ContentBlock{ //nolint:exhaustruct
				Type: acpfx.ContentBlockText, Text: text,
			},
		})
	}

	switch a.mode {
	case fakeAgentEcho:
		say("ARGV: " + strings.Join(os.Args[1:], " "))

	case fakeAgentTool:
		// A thought first: it must not end up in the answer.
		_ = emit(acpfx.SessionUpdate{ //nolint:exhaustruct
			SessionUpdate: acpfx.UpdateAgentThoughtChunk,
			Content: &acpfx.ContentBlock{ //nolint:exhaustruct
				Type: acpfx.ContentBlockText, Text: "thinking about it",
			},
		})
		say("Editing the file.")
		_ = emit(acpfx.SessionUpdate{ //nolint:exhaustruct
			SessionUpdate: acpfx.UpdateToolCall,
			ToolCall: &acpfx.ToolCall{ //nolint:exhaustruct
				ToolCallID: "tc-1",
				Title:      "Write",
				Kind:       "edit",
				RawInput:   json.RawMessage(`{"file_path":"/tmp/x"}`),
			},
		})

	case fakeAgentPermission:
		outcome, err := a.conn.RequestPermission(ctx, &acpfx.RequestPermissionRequest{
			SessionID: req.SessionID,
			ToolCall: acpfx.ToolCall{ //nolint:exhaustruct
				ToolCallID: "tc-1", Title: "Write", Kind: "edit",
			},
			Options: []acpfx.PermissionOption{
				{OptionID: "yes", Name: "Allow", Kind: acpfx.PermissionAllowOnce},
			},
		})
		if err != nil {
			say("PERMISSION-ERROR")

			break
		}

		say("PERMISSION:" + outcome.Outcome)

	default:
		say("Hello, ")
		say("world.")
	}

	return &acpfx.PromptResponse{StopReason: acpfx.StopReasonEndTurn}, nil
}

// runFakeACPAgent serves ACP on stdio until the client goes away. It never
// returns.
func runFakeACPAgent(mode string) {
	agent := &fakeACPAgent{mode: mode, conn: nil}
	agent.conn = acpfx.NewAgent(os.Stdin, os.Stdout, nil, agent)

	<-agent.conn.Done()

	os.Exit(0)
}

// fakeACPModel builds a model whose "shim" is this test binary.
func fakeACPModel(t *testing.T, factory ProviderFactory, mode string) LanguageModel {
	t.Helper()

	t.Setenv(fakeAgentEnv, mode)

	model, err := factory.CreateModel(t.Context(), &ConfigTarget{ //nolint:exhaustruct
		Provider:   factory.GetProvider(),
		Model:      "test-model",
		Properties: map[string]any{"binPath": os.Args[0]},
	})
	if err != nil {
		t.Fatalf("CreateModel: %v", err)
	}

	return model
}

func promptOptions() *GenerateTextOptions {
	return &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{{ //nolint:exhaustruct
			Role: RoleUser,
			Content: []ContentBlock{{ //nolint:exhaustruct
				Type: ContentBlockText, Text: "hi",
			}},
		}},
	}
}

// TestACPModelGeneratesText is the replacement contract for the three deleted
// CLI adapters: prompt in, assistant text out.
func TestACPModelGeneratesText(t *testing.T) {
	model := fakeACPModel(t, NewClaudeCodeModelFactory(), fakeAgentText)

	result, err := model.GenerateText(t.Context(), promptOptions())
	if err != nil {
		t.Fatalf("GenerateText: %v", err)
	}

	if got := result.Text(); got != "Hello, world." {
		t.Fatalf("text = %q", got)
	}

	if result.StopReason != StopReasonEndTurn {
		t.Fatalf("stopReason = %q", result.StopReason)
	}
}

// TestACPModelStreamsText pins that streaming is incremental rather than one
// chunk delivered at the end.
func TestACPModelStreamsText(t *testing.T) {
	model := fakeACPModel(t, NewKiroModelFactory(), fakeAgentText)

	iterator, err := model.StreamText(t.Context(), promptOptions())
	if err != nil {
		t.Fatalf("StreamText: %v", err)
	}

	defer func() { _ = iterator.Close() }()

	var (
		deltas []string
		done   bool
	)

	for iterator.Next() {
		event := iterator.Current()

		switch event.Type {
		case StreamEventContentDelta:
			deltas = append(deltas, event.TextDelta)
		case StreamEventMessageDone:
			done = true
		case StreamEventError:
			t.Fatalf("stream error: %v", event.Error)
		case StreamEventToolCallDelta:
		}
	}

	if !done {
		t.Fatal("the stream ended without a done event")
	}

	if len(deltas) < 2 {
		t.Fatalf("deltas = %v; the turn was delivered as one lump", deltas)
	}

	if strings.Join(deltas, "") != "Hello, world." {
		t.Fatalf("deltas joined to %q", strings.Join(deltas, ""))
	}
}

// TestACPModelSurfacesToolCalls pins capability the CLI adapters never had.
//
// Only claude-code mapped tool_use before, and kiro and opencode did not even
// declare CapabilityToolCalling. Going through ACP means a tool call is a
// protocol event every backend reports the same way.
func TestACPModelSurfacesToolCalls(t *testing.T) {
	model := fakeACPModel(t, NewOpenCodeModelFactory(), fakeAgentTool)

	result, err := model.GenerateText(t.Context(), promptOptions())
	if err != nil {
		t.Fatalf("GenerateText: %v", err)
	}

	var call *ToolCall

	for _, block := range result.Content {
		if block.Type == ContentBlockToolCall {
			call = block.ToolCall
		}
	}

	if call == nil {
		t.Fatalf("no tool call in %+v", result.Content)
	}

	if call.ID != "tc-1" || call.Name != "Write" {
		t.Fatalf("tool call = %+v", call)
	}

	if !strings.Contains(string(call.Arguments), "/tmp/x") {
		t.Fatalf("tool call arguments were dropped: %q", string(call.Arguments))
	}

	// A thought is not an answer. Folding it in is how a chain of reasoning ends
	// up presented to the user as the result.
	if strings.Contains(result.Text(), "thinking about it") {
		t.Fatalf("the agent's thought leaked into the answer: %q", result.Text())
	}
}

// TestACPModelRefusesPermissionRatherThanGrantingIt pins the safety property of
// running an agent from a function call.
//
// There is no user watching GenerateText, so there is nobody to approve
// anything. Auto-allowing would mean a caller that asked for text quietly
// authorised file writes and shell commands.
func TestACPModelRefusesPermissionRatherThanGrantingIt(t *testing.T) {
	model := fakeACPModel(t, NewClaudeCodeModelFactory(), fakeAgentPermission)

	result, err := model.GenerateText(t.Context(), promptOptions())
	if err != nil {
		t.Fatalf("GenerateText: %v", err)
	}

	if got := result.Text(); got != "PERMISSION:cancelled" {
		t.Fatalf("the agent was told %q; it must be cancelled, never selected", got)
	}
}

// TestACPModelSelectsTheProviderBackend pins that each provider drives its own
// vendor rather than all three collapsing onto one.
func TestACPModelSelectsTheProviderBackend(t *testing.T) {
	cases := []struct {
		factory ProviderFactory
		want    string
	}{
		{factory: NewClaudeCodeModelFactory(), want: "--backend claude-code"},
		{factory: NewKiroModelFactory(), want: "--backend kiro"},
		{factory: NewOpenCodeModelFactory(), want: "--backend opencode"},
	}

	for _, tc := range cases {
		model := fakeACPModel(t, tc.factory, fakeAgentEcho)

		result, err := model.GenerateText(t.Context(), promptOptions())
		if err != nil {
			t.Fatalf("GenerateText for %s: %v", tc.factory.GetProvider(), err)
		}

		if !strings.Contains(result.Text(), tc.want) {
			t.Fatalf("%s was invoked as %q, want %q",
				tc.factory.GetProvider(), result.Text(), tc.want)
		}

		if !strings.Contains(result.Text(), "--model test-model") {
			t.Fatalf("%s did not pass the model: %q", tc.factory.GetProvider(), result.Text())
		}
	}
}

// TestACPModelSendsPromptOffArgv pins the ARG_MAX property end to end.
//
// The prompt travels as an ACP content block over stdio. An implementation that
// regressed to argv would fail outright at this size, which is the point.
func TestACPModelSendsPromptOffArgv(t *testing.T) {
	model := fakeACPModel(t, NewKiroModelFactory(), fakeAgentEcho)

	needle := strings.Repeat("abcdefgh", 64*1024) // 512 KiB

	opts := &GenerateTextOptions{ //nolint:exhaustruct
		Messages: []Message{{ //nolint:exhaustruct
			Role: RoleUser,
			Content: []ContentBlock{{ //nolint:exhaustruct
				Type: ContentBlockText, Text: needle,
			}},
		}},
	}

	result, err := model.GenerateText(t.Context(), opts)
	if err != nil {
		t.Fatalf("GenerateText with a 512 KiB prompt: %v", err)
	}

	if strings.Contains(result.Text(), needle) {
		t.Fatal("the prompt was passed as argv -- this is the ARG_MAX hazard")
	}
}

// TestACPProvidersStayRegistered guards the reason these providers still exist
// in aifx at all.
//
// The registry is string-keyed: AddModel("kiro") does not fail to compile when
// a factory disappears, it fails at runtime in whatever called it. The FFI
// bridge passes the provider straight through from TypeScript, so a missing
// factory here is a runtime outage in another language.
func TestACPProvidersStayRegistered(t *testing.T) {
	registry := NewRegistry(WithDefaultFactories())

	registered := strings.Join(registry.ListRegisteredProviders(), " ")

	for _, provider := range []string{"claude-code", "kiro", "opencode"} {
		if !strings.Contains(registered, provider) {
			t.Fatalf("provider %q is no longer registered; have %s", provider, registered)
		}
	}
}
