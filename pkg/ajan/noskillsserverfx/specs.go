package noskillsserverfx

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// ── List specs ────────────────────────────────────────────────────────────────

type specSummary struct {
	Name  string `json:"name"`
	Phase string `json:"phase,omitempty"`
}

func (s *Server) handleListSpecs(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	root, ok := s.projectPath(slug)
	if !ok {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug))) //nolint:err113
	}

	names, err := noskillsfx.ListSpecStates(root)
	if err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("list specs: %w", err)))
	}

	list := make([]specSummary, 0, len(names))

	for _, name := range names {
		entry := specSummary{Name: name}

		// Best-effort: enrich with phase from per-spec state.
		if st, err := noskillsfx.ReadSpecState(root, name); err == nil && st != nil {
			entry.Phase = st.Phase
		}

		list = append(list, entry)
	}

	return ctx.Results.JSON(list)
}

// ── Create spec ───────────────────────────────────────────────────────────────

type createSpecRequest struct {
	Description string `json:"description"`
	Name        string `json:"name,omitempty"`
}

type createSpecResponse struct {
	Name  string `json:"name"`
	Phase string `json:"phase"`
}

func (s *Server) handleCreateSpec(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	root, ok := s.projectPath(slug)
	if !ok {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug))) //nolint:err113
	}

	if !noskillsfx.IsInitialized(root) {
		if err := noskillsfx.ScaffoldEserDir(root); err != nil {
			return ctx.Results.Error(http.StatusInternalServerError,
				httpfx.WithSanitizedError(fmt.Errorf("scaffold .eser: %w", err)))
		}
	}

	var req createSpecRequest
	if err := ctx.ParseJSONBody(&req); err != nil {
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("parse body: %w", err)))
	}

	if req.Description == "" {
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("description is required"))) //nolint:err113
	}

	name := req.Name
	if name == "" {
		name = noskillsfx.SlugFromDescription(req.Description)
	}

	if name == "" {
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("could not derive spec name from description"))) //nolint:err113
	}

	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("read state: %w", err)))
	}

	desc := req.Description
	newState, err := noskillsfx.StartSpec(state, name, "", &desc)

	if err != nil {
		return ctx.Results.Error(http.StatusConflict,
			httpfx.WithSanitizedError(fmt.Errorf("start spec: %w", err)))
	}

	if err := noskillsfx.WriteState(root, newState); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("write state: %w", err)))
	}

	return ctx.Results.JSON(&createSpecResponse{
		Name:  name,
		Phase: newState.Phase,
	})
}

// ── Spec actions ──────────────────────────────────────────────────────────────

type specActionRequest struct {
	// Answer is submitted with the `next` action during DISCOVERY.
	Answer string `json:"answer,omitempty"`
	// Reason is used with `done` and `block`.
	Reason string `json:"reason,omitempty"`
}

func (s *Server) handleSpecAction(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")
	name := ctx.Request.PathValue("name")
	action := ctx.Request.PathValue("action")

	root, ok := s.projectPath(slug)
	if !ok {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug))) //nolint:err113
	}

	var req specActionRequest

	// Body is optional — ignore parse errors for action-only calls.
	_ = ctx.ParseJSONBody(&req)

	switch action {
	case "next":
		return s.actionNext(ctx, root, name, req.Answer)
	case "approve":
		return s.actionApprove(ctx, root, name)
	case "done":
		return s.actionDone(ctx, root, name, req.Reason)
	case "block":
		return s.actionBlock(ctx, root, name, req.Reason)
	default:
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("unknown action %q (supported: next, approve, done, block)", action))) //nolint:err113
	}
}

// ── next ──────────────────────────────────────────────────────────────────────

func (s *Server) actionNext(ctx *httpfx.Context, root, specName, answer string) httpfx.Result {
	state, err := readSpecState(root, specName)
	if err != nil {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("read spec state: %w", err)))
	}

	manifest, _ := noskillsfx.ReadManifest(root) // best-effort; empty manifest is OK

	p := noskillsfx.NewPaths(root)

	allConcerns, _ := noskillsfx.LoadConcerns(p.ConcernsDir) // best-effort

	activeConcerns := noskillsfx.FilterActiveConcerns(allConcerns, manifest.Concerns)

	if answer != "" {
		newState, err := applySpecAnswer(state, answer, activeConcerns)
		if err != nil {
			return ctx.Results.Error(http.StatusUnprocessableEntity,
				httpfx.WithSanitizedError(fmt.Errorf("apply answer: %w", err)))
		}

		newState.LastCalledAt = ptrTime()

		if err := writeSpecState(root, specName, newState); err != nil {
			return ctx.Results.Error(http.StatusInternalServerError,
				httpfx.WithSanitizedError(fmt.Errorf("write state: %w", err)))
		}

		state = newState
	}

	out := noskillsfx.Compile(state, manifest, noskillsfx.CompileOptions{
		AllConcerns: allConcerns,
	})

	return ctx.Results.JSON(out)
}

// ── approve ───────────────────────────────────────────────────────────────────

func (s *Server) actionApprove(ctx *httpfx.Context, root, specName string) httpfx.Result {
	state, err := readSpecState(root, specName)
	if err != nil {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("read spec state: %w", err)))
	}

	var newState noskillsfx.StateFile

	switch state.Phase {
	case noskillsfx.PhaseDiscoveryRefinement:
		newState, err = noskillsfx.ApproveDiscoveryReview(state)
	case noskillsfx.PhaseSpecProposal:
		newState, err = noskillsfx.ApproveSpec(state)
	case noskillsfx.PhaseSpecApproved:
		newState, err = noskillsfx.StartExecution(state)
	default:
		return ctx.Results.Error(http.StatusConflict,
			httpfx.WithSanitizedError(fmt.Errorf("cannot approve from phase %q", state.Phase))) //nolint:err113
	}

	if err != nil {
		return ctx.Results.Error(http.StatusConflict,
			httpfx.WithSanitizedError(fmt.Errorf("approve: %w", err)))
	}

	if err := writeSpecState(root, specName, newState); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("write state: %w", err)))
	}

	return ctx.Results.JSON(map[string]string{"phase": newState.Phase})
}

// ── done ──────────────────────────────────────────────────────────────────────

func (s *Server) actionDone(ctx *httpfx.Context, root, specName, note string) httpfx.Result {
	state, err := readSpecState(root, specName)
	if err != nil {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("read spec state: %w", err)))
	}

	var notePtr *string
	if note != "" {
		notePtr = &note
	}

	newState, err := noskillsfx.CompleteSpec(state, noskillsfx.CompletionDone, notePtr,
		time.Now().UTC().Format(time.RFC3339))
	if err != nil {
		return ctx.Results.Error(http.StatusConflict,
			httpfx.WithSanitizedError(fmt.Errorf("complete spec: %w", err)))
	}

	if err := writeSpecState(root, specName, newState); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("write state: %w", err)))
	}

	return ctx.Results.JSON(map[string]string{"phase": newState.Phase})
}

// ── block ─────────────────────────────────────────────────────────────────────

func (s *Server) actionBlock(ctx *httpfx.Context, root, specName, reason string) httpfx.Result {
	state, err := readSpecState(root, specName)
	if err != nil {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("read spec state: %w", err)))
	}

	newState, err := noskillsfx.BlockExecution(state)
	if err != nil {
		return ctx.Results.Error(http.StatusConflict,
			httpfx.WithSanitizedError(fmt.Errorf("block execution: %w", err)))
	}

	if reason != "" {
		newState.Discovery.UserContext = append(newState.Discovery.UserContext, "BLOCKED: "+reason)
	}

	if err := writeSpecState(root, specName, newState); err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("write state: %w", err)))
	}

	return ctx.Results.JSON(map[string]string{"phase": newState.Phase})
}

// ── helpers ───────────────────────────────────────────────────────────────────

// readSpecState reads per-spec state, falling back to ReadState when the
// per-spec file is absent and the global state matches specName.
func readSpecState(root, specName string) (noskillsfx.StateFile, error) {
	perSpec, err := noskillsfx.ReadSpecState(root, specName)
	if err != nil {
		return noskillsfx.StateFile{}, err
	}

	if perSpec != nil {
		return *perSpec, nil
	}

	// Fall back: try global state.
	global, err := noskillsfx.ReadState(root)
	if err != nil {
		return noskillsfx.StateFile{}, err
	}

	if global.Spec != nil && *global.Spec == specName {
		return global, nil
	}

	return noskillsfx.StateFile{}, fmt.Errorf("spec %q not found", specName) //nolint:err113
}

// writeSpecState persists both the per-spec state and the global state.json
// so both the per-spec and the "active" view stay consistent.
func writeSpecState(root, specName string, state noskillsfx.StateFile) error {
	if err := noskillsfx.WriteSpecState(root, specName, state); err != nil {
		return err
	}

	// Keep global state.json in sync when the spec name matches.
	global, _ := noskillsfx.ReadState(root)
	if global.Spec == nil || *global.Spec == specName {
		_ = noskillsfx.WriteState(root, state)
	}

	return nil
}

// applySpecAnswer applies a single answer to the state during DISCOVERY.
// Mirrors the CLI's applyAnswer function.
func applySpecAnswer(
	state noskillsfx.StateFile,
	answer string,
	activeConcerns []noskillsfx.ConcernDefinition,
) (noskillsfx.StateFile, error) {
	switch state.Phase {
	case noskillsfx.PhaseDiscovery:
		if state.Discovery.Mode == nil {
			mode := strings.TrimSpace(answer)
			disc := state.Discovery
			disc.Mode = &mode
			state.Discovery = disc

			return state, nil
		}

		questions := noskillsfx.GetQuestionsWithExtras(activeConcerns)
		next := noskillsfx.GetNextUnanswered(questions, state.Discovery.Answers)

		if next != nil {
			state = noskillsfx.AddDiscoveryAnswer(state, noskillsfx.DiscoveryAnswer{
				QuestionID: next.ID,
				Answer:     answer,
			})

			return state, nil
		}

		return state, fmt.Errorf("no unanswered questions in DISCOVERY phase") //nolint:err113

	default:
		return state, fmt.Errorf("answer not applicable in phase %q", state.Phase) //nolint:err113
	}
}

func ptrTime() *string {
	now := time.Now().UTC().Format(time.RFC3339)

	return &now
}
