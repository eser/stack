package acpfx

import (
	"encoding/json"
	"fmt"
)

// ProtocolVersion is the ACP revision this package speaks.
//
// v1 is the stable revision. Do not bump this to track the draft: v2 changes
// session/prompt from "block until the turn ends, return a stop reason" to
// "return immediately, report completion via notifications", which inverts the
// control flow in Session.Prompt.
const ProtocolVersion = 1

// Method names. Client -> Agent unless noted.
const (
	MethodInitialize     = "initialize"
	MethodAuthenticate   = "authenticate"
	MethodSessionNew     = "session/new"
	MethodSessionLoad    = "session/load"
	MethodSessionPrompt  = "session/prompt"
	MethodSessionSetMode = "session/set_mode"
	MethodSessionCancel  = "session/cancel" // notification

	// Agent -> Client.
	MethodSessionUpdate       = "session/update" // notification
	MethodRequestPermission   = "session/request_permission"
	MethodFsReadTextFile      = "fs/read_text_file"
	MethodFsWriteTextFile     = "fs/write_text_file"
	MethodTerminalCreate      = "terminal/create"
	MethodTerminalOutput      = "terminal/output"
	MethodTerminalRelease     = "terminal/release"
	MethodTerminalWaitForExit = "terminal/wait_for_exit"
	MethodTerminalKill        = "terminal/kill"
)

// StopReason explains why a prompt turn ended.
type StopReason string

// The five v1 stop reasons. Note that refusal and max_turn_requests have no
// analogue in aifx.StopReason -- mapping must handle them explicitly rather
// than falling through to "stop".
const (
	StopReasonEndTurn         StopReason = "end_turn"
	StopReasonMaxTokens       StopReason = "max_tokens"
	StopReasonMaxTurnRequests StopReason = "max_turn_requests"
	StopReasonRefusal         StopReason = "refusal"
	StopReasonCancelled       StopReason = "cancelled"
)

// Implementation identifies a client or agent build.
type Implementation struct {
	Name    string `json:"name"`
	Title   string `json:"title,omitempty"`
	Version string `json:"version"`
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

// FileSystemCapability declares which fs/* methods the client serves.
type FileSystemCapability struct {
	ReadTextFile  bool `json:"readTextFile"`
	WriteTextFile bool `json:"writeTextFile"`
}

// ClientCapabilities is what we advertise in initialize.
//
// These must be derived from the handler rather than hand-set: advertising a
// capability we do not serve makes the agent call a method we answer with
// "method not found" mid-turn.
type ClientCapabilities struct {
	Fs       FileSystemCapability `json:"fs"`
	Terminal bool                 `json:"terminal"`
}

// PromptCapabilities declares which content types the agent accepts in a prompt.
type PromptCapabilities struct {
	Image           bool `json:"image,omitempty"`
	Audio           bool `json:"audio,omitempty"`
	EmbeddedContext bool `json:"embeddedContext,omitempty"`
}

// AgentCapabilities is what the agent advertises back.
type AgentCapabilities struct {
	Prompt      PromptCapabilities `json:"promptCapabilities,omitzero"`
	LoadSession bool               `json:"loadSession,omitempty"`
}

// AuthMethod is one authentication option the agent offers.
type AuthMethod struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// ---------------------------------------------------------------------------
// initialize
// ---------------------------------------------------------------------------

type InitializeRequest struct {
	ClientInfo         *Implementation    `json:"clientInfo,omitempty"`
	ClientCapabilities ClientCapabilities `json:"clientCapabilities,omitzero"`
	ProtocolVersion    int                `json:"protocolVersion"`
}

type InitializeResponse struct {
	AgentInfo         *Implementation   `json:"agentInfo,omitempty"`
	AuthMethods       []AuthMethod      `json:"authMethods,omitempty"`
	AgentCapabilities AgentCapabilities `json:"agentCapabilities,omitzero"`
	ProtocolVersion   int               `json:"protocolVersion"`
}

type AuthenticateRequest struct {
	MethodID string `json:"methodId"`
}

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------

// McpServer describes an MCP server the agent should connect to for the
// session. The field is required by the schema even when empty.
type McpServer struct {
	Env     map[string]string `json:"env,omitempty"`
	Name    string            `json:"name"`
	Command string            `json:"command"`
	Args    []string          `json:"args,omitempty"`
}

type NewSessionRequest struct {
	Cwd                   string      `json:"cwd"`
	AdditionalDirectories []string    `json:"additionalDirectories,omitempty"`
	McpServers            []McpServer `json:"mcpServers"`
}

type SessionMode struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type SessionModeState struct {
	CurrentModeID  string        `json:"currentModeId"`
	AvailableModes []SessionMode `json:"availableModes,omitempty"`
}

type NewSessionResponse struct {
	Modes     *SessionModeState `json:"modes,omitempty"`
	SessionID string            `json:"sessionId"`
}

type LoadSessionRequest struct {
	SessionID             string      `json:"sessionId"`
	Cwd                   string      `json:"cwd"`
	AdditionalDirectories []string    `json:"additionalDirectories,omitempty"`
	McpServers            []McpServer `json:"mcpServers"`
}

type LoadSessionResponse struct {
	Modes *SessionModeState `json:"modes,omitempty"`
}

type SetSessionModeRequest struct {
	SessionID string `json:"sessionId"`
	ModeID    string `json:"modeId"`
}

type PromptRequest struct {
	SessionID string         `json:"sessionId"`
	Prompt    []ContentBlock `json:"prompt"`
}

type PromptResponse struct {
	StopReason StopReason `json:"stopReason"`
}

type CancelNotification struct {
	SessionID string `json:"sessionId"`
}

// ---------------------------------------------------------------------------
// ContentBlock -- a 5-variant union discriminated by "type"
// ---------------------------------------------------------------------------

// ContentBlockType enumerates the ContentBlock variants.
type ContentBlockType string

const (
	ContentBlockText         ContentBlockType = "text"
	ContentBlockImage        ContentBlockType = "image"
	ContentBlockAudio        ContentBlockType = "audio"
	ContentBlockResourceLink ContentBlockType = "resource_link"
	ContentBlockResource     ContentBlockType = "resource"
)

// ContentBlock is modelled as a flat struct with a discriminator and nilable
// fields rather than a Go interface.
//
// This matches how aifx already models its own variant types (see
// aifx.StreamEvent) and keeps the value copyable and JSON-round-trippable
// without custom marshalling on the happy path.
type ContentBlock struct {
	Text     string           `json:"text,omitempty"`
	Data     string           `json:"data,omitempty"`
	MimeType string           `json:"mimeType,omitempty"`
	URI      string           `json:"uri,omitempty"`
	Name     string           `json:"name,omitempty"`
	Resource json.RawMessage  `json:"resource,omitempty"`
	Type     ContentBlockType `json:"type"`
}

// TextBlock builds the only content type every ACP agent must accept.
func TextBlock(text string) ContentBlock {
	return ContentBlock{Type: ContentBlockText, Text: text} //nolint:exhaustruct
}

// ---------------------------------------------------------------------------
// SessionUpdate -- an 11-variant union discriminated by "sessionUpdate"
// ---------------------------------------------------------------------------

// SessionUpdateKind enumerates the SessionUpdate variants.
type SessionUpdateKind string

const (
	UpdateUserMessageChunk  SessionUpdateKind = "user_message_chunk"
	UpdateAgentMessageChunk SessionUpdateKind = "agent_message_chunk"
	UpdateAgentThoughtChunk SessionUpdateKind = "agent_thought_chunk"
	UpdateToolCall          SessionUpdateKind = "tool_call"
	UpdateToolCallUpdate    SessionUpdateKind = "tool_call_update"
	UpdatePlan              SessionUpdateKind = "plan"
	UpdateAvailableCommands SessionUpdateKind = "available_commands_update"
	UpdateCurrentMode       SessionUpdateKind = "current_mode_update"
	UpdateConfigOption      SessionUpdateKind = "config_option_update"
	UpdateSessionInfo       SessionUpdateKind = "session_info_update"
)

// ToolCallStatus tracks a tool call through its lifecycle.
type ToolCallStatus string

const (
	ToolCallPending    ToolCallStatus = "pending"
	ToolCallInProgress ToolCallStatus = "in_progress"
	ToolCallCompleted  ToolCallStatus = "completed"
	ToolCallFailed     ToolCallStatus = "failed"
)

// ToolCall describes a tool invocation the agent is making.
//
// Kind ("read", "edit", "execute", "fetch", ...) is worth noting: it is a
// better input to this repo's read-vs-write durability classification than
// noskillsserverfx's name-matching ClassifyTool, because it also covers tools
// the classifier has never seen.
type ToolCall struct {
	RawInput   json.RawMessage `json:"rawInput,omitempty"`
	ToolCallID string          `json:"toolCallId"`
	Title      string          `json:"title,omitempty"`
	Kind       string          `json:"kind,omitempty"`
	Status     ToolCallStatus  `json:"status,omitempty"`
	Content    []ContentBlock  `json:"content,omitempty"`
}

// SessionUpdate is one streamed change within a session.
//
// Like ContentBlock this is a flat struct: SessionUpdate carries the
// discriminator plus whichever fields that variant populates.
type SessionUpdate struct {
	Content       *ContentBlock     `json:"content,omitempty"`
	ToolCall      *ToolCall         `json:"-"`
	Modes         *SessionModeState `json:"modes,omitempty"`
	Raw           json.RawMessage   `json:"-"`
	SessionUpdate SessionUpdateKind `json:"sessionUpdate"`
}

// MarshalJSON flattens ToolCall back into the update object.
//
// ACP does not nest a tool call under a "toolCall" key -- its fields sit
// directly on the update, which is why ToolCall is tagged "-" and reassembled
// by UnmarshalJSON. Without the inverse here, marshalling a tool_call update
// silently drops every field of it: the agent half emits an update naming a
// tool call it never describes.
func (u SessionUpdate) MarshalJSON() ([]byte, error) {
	type alias SessionUpdate

	base, err := json.Marshal(alias(u))
	if err != nil {
		return nil, fmt.Errorf("encode session update: %w", err)
	}

	if u.ToolCall == nil {
		return base, nil
	}

	call, err := json.Marshal(u.ToolCall)
	if err != nil {
		return nil, fmt.Errorf("encode tool call: %w", err)
	}

	return mergeJSONObjects(base, call)
}

// mergeJSONObjects folds src into dst. Keys already present in dst win, so a
// field the update itself set is never overwritten by the flattened variant.
func mergeJSONObjects(dst, src []byte) ([]byte, error) {
	var into map[string]json.RawMessage
	if err := json.Unmarshal(dst, &into); err != nil {
		return nil, fmt.Errorf("merge session update: %w", err)
	}

	var from map[string]json.RawMessage
	if err := json.Unmarshal(src, &from); err != nil {
		return nil, fmt.Errorf("merge tool call: %w", err)
	}

	for key, value := range from {
		if _, exists := into[key]; !exists {
			into[key] = value
		}
	}

	merged, err := json.Marshal(into)
	if err != nil {
		return nil, fmt.Errorf("encode merged session update: %w", err)
	}

	return merged, nil
}

// UnmarshalJSON decodes the variant, keeping the raw payload so callers can
// reach fields this struct does not model yet. Forward compatibility matters
// here: an agent on a newer point release may send variants we predate, and
// dropping the connection over one is worse than ignoring it.
func (u *SessionUpdate) UnmarshalJSON(data []byte) error {
	type alias SessionUpdate

	var base alias
	if err := json.Unmarshal(data, &base); err != nil {
		return fmt.Errorf("decode session update: %w", err)
	}

	*u = SessionUpdate(base)
	u.Raw = append(json.RawMessage(nil), data...)

	switch u.SessionUpdate {
	case UpdateToolCall, UpdateToolCallUpdate:
		var call ToolCall
		if err := json.Unmarshal(data, &call); err != nil {
			return fmt.Errorf("decode tool call: %w", err)
		}

		u.ToolCall = &call

	case UpdateUserMessageChunk, UpdateAgentMessageChunk, UpdateAgentThoughtChunk,
		UpdatePlan, UpdateAvailableCommands, UpdateCurrentMode,
		UpdateConfigOption, UpdateSessionInfo:
		// Already covered by the base decode, or intentionally left in Raw.
	}

	return nil
}

// SessionNotification is the session/update envelope.
type SessionNotification struct {
	SessionID string        `json:"sessionId"`
	Update    SessionUpdate `json:"update"`
}

// ---------------------------------------------------------------------------
// session/request_permission
// ---------------------------------------------------------------------------

// PermissionOptionKind classifies what an option means, so a policy can decide
// without string-matching the human-facing name.
type PermissionOptionKind string

const (
	PermissionAllowOnce    PermissionOptionKind = "allow_once"
	PermissionAllowAlways  PermissionOptionKind = "allow_always"
	PermissionRejectOnce   PermissionOptionKind = "reject_once"
	PermissionRejectAlways PermissionOptionKind = "reject_always"
)

// PermissionOption is one choice the agent offers.
type PermissionOption struct {
	OptionID string               `json:"optionId"`
	Name     string               `json:"name"`
	Kind     PermissionOptionKind `json:"kind"`
}

type RequestPermissionRequest struct {
	SessionID string             `json:"sessionId"`
	ToolCall  ToolCall           `json:"toolCall"`
	Options   []PermissionOption `json:"options"`
}

// PermissionOutcome is either "selected" with an option id, or "cancelled".
//
// A client cannot invent an outcome: it must pick an OptionID the agent
// offered, or cancel.
type PermissionOutcome struct {
	Outcome  string `json:"outcome"`
	OptionID string `json:"optionId,omitempty"`
}

// SelectOption builds a "selected" outcome.
func SelectOption(optionID string) PermissionOutcome {
	return PermissionOutcome{Outcome: "selected", OptionID: optionID}
}

// CancelPermission builds the outcome required when a turn is cancelled while a
// permission request is outstanding.
func CancelPermission() PermissionOutcome {
	return PermissionOutcome{Outcome: "cancelled"} //nolint:exhaustruct
}

type RequestPermissionResponse struct {
	Outcome PermissionOutcome `json:"outcome"`
}

// ---------------------------------------------------------------------------
// fs/* -- the filesystem capability the client serves
// ---------------------------------------------------------------------------

// ReadTextFileRequest asks the client to read a file on the agent's behalf.
//
// Line and Limit are pointers because the schema distinguishes "not requested"
// from zero, and the two mean opposite things: an absent Limit is "the whole
// file", a zero Limit is "no lines at all".
type ReadTextFileRequest struct {
	Line      *int   `json:"line,omitempty"`
	Limit     *int   `json:"limit,omitempty"`
	SessionID string `json:"sessionId"`
	Path      string `json:"path"`
}

type ReadTextFileResponse struct {
	Content string `json:"content"`
}

type WriteTextFileRequest struct {
	SessionID string `json:"sessionId"`
	Path      string `json:"path"`
	Content   string `json:"content"`
}

// WriteTextFileResponse is empty: the schema defines no fields beyond _meta.
type WriteTextFileResponse struct{}

// ---------------------------------------------------------------------------
// terminal/* -- the terminal capability the client serves
// ---------------------------------------------------------------------------

// EnvVariable is one name/value pair for a spawned command.
type EnvVariable struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// CreateTerminalRequest asks the client to run a command.
//
// The agent supplies argv already split, so nothing here is passed through a
// shell -- there is no quoting or word-splitting step to get wrong.
type CreateTerminalRequest struct {
	OutputByteLimit *int          `json:"outputByteLimit,omitempty"`
	SessionID       string        `json:"sessionId"`
	Command         string        `json:"command"`
	Cwd             string        `json:"cwd,omitempty"`
	Args            []string      `json:"args,omitempty"`
	Env             []EnvVariable `json:"env,omitempty"`
}

type CreateTerminalResponse struct {
	TerminalID string `json:"terminalId"`
}

// TerminalExitStatus reports how a command ended.
//
// Both fields are nilable and both may be nil at once: that is the honest
// encoding of "the process is gone but the manner of its death was not
// recoverable", which is distinct from exit code 0.
type TerminalExitStatus struct {
	ExitCode *int    `json:"exitCode"`
	Signal   *string `json:"signal"`
}

type TerminalOutputRequest struct {
	SessionID  string `json:"sessionId"`
	TerminalID string `json:"terminalId"`
}

type TerminalOutputResponse struct {
	ExitStatus *TerminalExitStatus `json:"exitStatus"`
	Output     string              `json:"output"`
	Truncated  bool                `json:"truncated"`
}

type WaitForTerminalExitRequest struct {
	SessionID  string `json:"sessionId"`
	TerminalID string `json:"terminalId"`
}

// WaitForTerminalExitResponse is TerminalExitStatus inlined, not nested: the
// schema puts exitCode and signal at the top level of this response.
type WaitForTerminalExitResponse struct {
	ExitCode *int    `json:"exitCode"`
	Signal   *string `json:"signal"`
}

type KillTerminalRequest struct {
	SessionID  string `json:"sessionId"`
	TerminalID string `json:"terminalId"`
}

// KillTerminalResponse is empty: the schema defines no fields beyond _meta.
type KillTerminalResponse struct{}

type ReleaseTerminalRequest struct {
	SessionID  string `json:"sessionId"`
	TerminalID string `json:"terminalId"`
}

// ReleaseTerminalResponse is empty: the schema defines no fields beyond _meta.
type ReleaseTerminalResponse struct{}
