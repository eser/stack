package aifx

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"slices"
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

	// fakeAgentEcho answers with its own argv, so a test can see how the shim
	// was invoked.
	fakeAgentEcho = "echo"
)

// TestMain intercepts before flag parsing: the fake agent is spawned with the
// shim's flags (--backend, --model), which the testing package would reject.
func TestMain(m *testing.M) {
	if mode := os.Getenv(fakeAgentEnv); mode != "" {
		runFakeVendorCLI(mode)
	}

	os.Exit(m.Run())
}

// fakeACPAgent serves the agent half of ACP on stdio.
// runFakeVendorCLI impersonates the `claude` CLI, not an ACP agent.
//
// The shim used to live behind a subprocess, so these tests faked the shim
// itself. It is in-process now, so faking it would test nothing but the fake --
// the real shim, the real ACP handshake and the real in-process transport are
// all under test here, and only the vendor binary at the very bottom is
// substituted. That is the boundary that genuinely is another program.
//
// The output format is claude's `--output-format stream-json`: one JSON object
// per line. See pkg/ajan/acpfx/shim/claudecode.go for the fields consumed.
func runFakeVendorCLI(mode string) {
	// The prompt arrives on stdin. Drain it so a large one cannot deadlock the
	// writer -- which is exactly what the off-argv test checks.
	prompt, _ := io.ReadAll(os.Stdin)

	emit := func(value any) {
		line, _ := json.Marshal(value)
		//nolint:forbidigo
		fmt.Println(string(line))
	}

	assistantText := func(text string) map[string]any {
		return map[string]any{
			"type": "assistant",
			"message": map[string]any{
				"content": []map[string]any{{"type": "text", "text": text}},
			},
		}
	}

	// Which dialect to speak is decided the way the real CLIs differ: claude is
	// invoked with --output-format stream-json, kiro and opencode are not. A
	// single fake that always spoke claude JSON would leave the kiro and
	// opencode translations untested while looking like it covered them.
	streamJSON := slices.Contains(os.Args, "stream-json")

	if !streamJSON {
		// kiro's spec sets prose:true, so a non-JSON line IS the answer.
		//nolint:forbidigo
		fmt.Println("Hello, ")
		//nolint:forbidigo
		fmt.Println("world.")

		os.Exit(0)
	}

	emit(map[string]any{"type": "system", "subtype": "init", "session_id": "fake-session"})

	switch mode {
	case fakeAgentTool:
		emit(map[string]any{
			"type": "assistant",
			"message": map[string]any{
				"content": []map[string]any{{
					"type":  "tool_use",
					"id":    "call_1",
					"name":  "get_weather",
					"input": map[string]any{"city": "Istanbul"},
				}},
			},
		})

	case fakeAgentEcho:
		// Report what it received AND how it was invoked, so a caller can prove
		// the prompt travelled off argv (a 512 KiB argv would not have spawned
		// at all) and that the vendor flags arrived.
		emit(assistantText(fmt.Sprintf(
			"received %d bytes argv=%s", len(prompt), strings.Join(os.Args[1:], " "))))

	default:
		emit(assistantText("Hello, "))
		emit(assistantText("world."))
	}

	emit(map[string]any{"type": "result", "subtype": "success", "result": "done"})

	os.Exit(0)
}

// fakeACPModel builds a model whose VENDOR CLI is this test binary. The shim
// and the ACP link between it and the model are the real ones.
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

	joined := strings.Join(deltas, "")

	// Whitespace is not normalised: kiro's prose path forwards each line as the
	// vendor wrote it, newline included. What matters is that the answer arrived
	// whole and in pieces, not that the shim reformatted it.
	if !strings.Contains(joined, "Hello,") || !strings.Contains(joined, "world.") {
		t.Fatalf("deltas joined to %q", joined)
	}
}

// TestACPModelSurfacesToolCalls pins capability the CLI adapters never had.
//
// Only claude-code mapped tool_use before, and kiro and opencode did not even
// declare CapabilityToolCalling. Going through ACP means a tool call is a
// protocol event every backend reports the same way.
func TestACPModelSurfacesToolCalls(t *testing.T) {
	// claude-code, not opencode.
	//
	// This used to run against opencode and pass, but only because the fake WAS
	// the ACP agent and emitted a tool_call update directly, skipping the vendor
	// translation entirely. Driving the real shim shows the truth: mapOpenCodeEvent
	// classifies text, done and error only -- it has no tool-call path, so
	// opencode cannot surface one no matter what the CLI prints. The old test
	// asserted a capability the backend does not have.
	model := fakeACPModel(t, NewClaudeCodeModelFactory(), fakeAgentTool)

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

	if call.ID != "call_1" || call.Name != "get_weather" {
		t.Fatalf("tool call = %+v", call)
	}

	if !strings.Contains(string(call.Arguments), "Istanbul") {
		t.Fatalf("tool call arguments were dropped: %q", string(call.Arguments))
	}
}

// TestACPRefusesPermissionRatherThanGrantingIt pins the safety property of
// running an agent from a function call.
//
// There is no user watching GenerateText, so there is nobody to approve
// anything. Auto-allowing would mean a caller that asked for text quietly
// authorised file writes and shell commands.
//
// Tested on the handler directly rather than end to end. The old version drove
// a fake ACP agent that issued the request; with the shim in-process the agent
// IS the shim, and no vendor backend ever asks for permission -- so an end-to-end
// version would exercise a path that cannot occur and prove nothing.
func TestACPRefusesPermissionRatherThanGrantingIt(t *testing.T) {
	t.Parallel()

	handler := &acpClientHandler{sink: nil}

	outcome, err := handler.RequestPermission(
		t.Context(),
		&acpfx.RequestPermissionRequest{ //nolint:exhaustruct
			Options: []acpfx.PermissionOption{
				{OptionID: "allow", Name: "Allow", Kind: acpfx.PermissionAllowOnce},
			},
		},
	)
	if err != nil {
		t.Fatalf("RequestPermission: %v", err)
	}

	if outcome.Outcome != "cancelled" {
		t.Fatalf("outcome = %q, want cancelled; an option was selected on the user's behalf",
			outcome.Outcome)
	}
}

// TestACPBackendPerProvider pins that each provider drives its own vendor
// rather than all three collapsing onto one.
//
// A type assertion, not an argv match: the backend is now a struct built in
// this process, so there is no command line to inspect. The flags each backend
// passes to its CLI are that backend's own concern and are covered by the shim
// package.
func TestACPBackendPerProvider(t *testing.T) {
	t.Parallel()

	cases := []struct {
		factory ProviderFactory
		want    string
	}{
		{factory: NewClaudeCodeModelFactory(), want: "*shim.ClaudeCode"},
		{factory: NewKiroModelFactory(), want: "*shim.Kiro"},
		{factory: NewOpenCodeModelFactory(), want: "*shim.OpenCode"},
	}

	for _, tc := range cases {
		model, err := tc.factory.CreateModel(t.Context(), &ConfigTarget{ //nolint:exhaustruct
			Provider: tc.factory.GetProvider(),
			Model:    "test-model",
		})
		if err != nil {
			t.Fatalf("CreateModel %s: %v", tc.factory.GetProvider(), err)
		}

		acpModel, ok := model.(*ACPModel)
		if !ok {
			t.Fatalf("%s did not produce an ACPModel", tc.factory.GetProvider())
		}

		backend, err := acpModel.backendImpl()
		if err != nil {
			t.Fatalf("backendImpl %s: %v", tc.factory.GetProvider(), err)
		}

		if got := fmt.Sprintf("%T", backend); got != tc.want {
			t.Fatalf("%s built %s, want %s", tc.factory.GetProvider(), got, tc.want)
		}

		if args := acpModel.vendorArgs(); !slices.Contains(args, "test-model") {
			t.Fatalf("%s dropped the model: %v", tc.factory.GetProvider(), args)
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
