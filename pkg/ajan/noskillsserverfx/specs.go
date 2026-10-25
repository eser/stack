package noskillsserverfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The spec endpoints run the lifecycle commands of noskillsfx, the ones
// the noskills CLI runs, so a spec moves through the same states and files
// whichever of them drives it.

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

	entries := noskillsfx.SpecList(lifecycleEnv(root))
	list := make([]specSummary, 0, len(entries))

	for _, item := range entries {
		entry, _ := item.(*noskillsfx.JSObject)
		name, _ := entry.Get("name")
		phase, _ := entry.Get("phase")
		nameText, _ := name.(string)
		phaseText, _ := phase.(string)

		list = append(list, specSummary{Name: nameText, Phase: phaseText})
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

// refusalResult answers a lifecycle refusal with its message and status.
func refusalResult(ctx *httpfx.Context, err error, status int) httpfx.Result {
	var notFound *noskillsfx.SpecNotFoundError
	if errors.As(err, &notFound) {
		return ctx.Results.Error(http.StatusNotFound, httpfx.WithErrorMessage(err.Error()))
	}

	if refusal, ok := noskillsfx.IsRefusal(err); ok {
		return ctx.Results.Error(status, httpfx.WithErrorMessage(refusal.Message))
	}

	if errors.Is(err, noskillsfx.ErrLifecycle) {
		return ctx.Results.Error(status, httpfx.WithErrorMessage(err.Error()))
	}

	return ctx.Results.Error(http.StatusInternalServerError, httpfx.WithSanitizedError(err))
}

func (s *Server) handleCreateSpec(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")

	root, ok := s.projectPath(slug)
	if !ok {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug))) //nolint:err113
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

	env := lifecycleEnv(root)

	if !noskillsfx.IsHookInitialized(root) {
		if _, err := noskillsfx.InitWithoutPrompts(env, providerProbe(ctx.Request.Context()),
			noskillsfx.DefaultCommandPrefix); err != nil {
			return ctx.Results.Error(http.StatusInternalServerError,
				httpfx.WithSanitizedError(fmt.Errorf("initialize noskills: %w", err)))
		}
	}

	result, err := noskillsfx.SpecNew(ctx.Request.Context(), env, noskillsfx.SpecNewOptions{
		Name: req.Name, Description: req.Description, PlanPath: "",
	})
	if err != nil {
		return refusalResult(ctx, err, http.StatusConflict)
	}

	return ctx.Results.JSON(&createSpecResponse{Name: result.Name, Phase: noskillsfx.PhaseDiscovery})
}

// ── Decision ledger (read-only) ─────────────────────────────────────────────

type ledgerResponse struct {
	Spec    string            `json:"spec"`
	Records []json.RawMessage `json:"records"`
	Summary json.RawMessage   `json:"summary"`
}

func (s *Server) handleSpecLedger(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")
	name := ctx.Request.PathValue("name")

	root, ok := s.projectPath(slug)
	if !ok {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug))) //nolint:err113
	}

	records, err := noskillsfx.ReadLedgerRaw(root, name)
	if err != nil {
		return ctx.Results.Error(http.StatusInternalServerError,
			httpfx.WithSanitizedError(fmt.Errorf("read ledger: %w", err)))
	}

	return ctx.Results.JSON(&ledgerResponse{
		Spec:    name,
		Records: records,
		Summary: noskillsfx.ReadSummaryRaw(root, name),
	})
}

type summaryResponse struct {
	Spec    string          `json:"spec"`
	Summary json.RawMessage `json:"summary"`
}

func (s *Server) handleSpecSummary(ctx *httpfx.Context) httpfx.Result {
	slug := ctx.Request.PathValue("slug")
	name := ctx.Request.PathValue("name")

	root, ok := s.projectPath(slug)
	if !ok {
		return ctx.Results.Error(http.StatusNotFound,
			httpfx.WithSanitizedError(fmt.Errorf("project %q not found", slug))) //nolint:err113
	}

	return ctx.Results.JSON(&summaryResponse{
		Spec:    name,
		Summary: noskillsfx.ReadSummaryRaw(root, name),
	})
}

// ── Spec actions ──────────────────────────────────────────────────────────────

type specActionRequest struct {
	// Answer is submitted with the `next` action.
	Answer *string `json:"answer,omitempty"`
	// Reason is used with `done` (the completion note) and `block`.
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

	env := lifecycleEnv(root)
	requestCtx := ctx.Request.Context()

	switch action {
	case "next":
		answer := req.Answer
		if answer != nil && *answer == "" {
			answer = nil
		}

		// next answers a missing spec with an error object, as the CLI does;
		// the endpoint answers it with 404, as the other actions do.
		if _, err := noskillsfx.ResolveState(root, name, noskillsfx.DefaultCommandPrefix, nil); err != nil {
			return refusalResult(ctx, err, http.StatusUnprocessableEntity)
		}

		result, err := noskillsfx.Next(requestCtx, env, noskillsfx.NextOptions{Spec: name, Answer: answer, Audience: "human"})

		switch {
		case errors.Is(err, noskillsfx.ErrNeedsTypeScript):
			return ctx.Results.Error(http.StatusNotImplemented, httpfx.WithErrorMessage(
				"This answer runs in the noskills CLI only; run it there."))
		case err != nil:
			return refusalResult(ctx, err, http.StatusUnprocessableEntity)
		case result.ExitCode != 0:
			return ctx.Results.Error(http.StatusUnprocessableEntity, httpfx.WithJSON(result.Output))
		}

		return ctx.Results.JSON(result.Output)
	case "approve":
		result, err := noskillsfx.Approve(requestCtx, env, name)
		if err != nil {
			return refusalResult(ctx, err, http.StatusConflict)
		}

		if result.From == result.To {
			return ctx.Results.Error(http.StatusConflict,
				httpfx.WithErrorMessage("Cannot approve in phase: "+result.From))
		}

		return ctx.Results.JSON(map[string]string{"phase": result.To})
	case "done":
		if _, err := noskillsfx.Done(requestCtx, env, name, req.Reason); err != nil {
			return refusalResult(ctx, err, http.StatusConflict)
		}

		return ctx.Results.JSON(map[string]string{"phase": noskillsfx.PhaseCompleted})
	case "block":
		if err := noskillsfx.Block(requestCtx, env, name, req.Reason); err != nil {
			return refusalResult(ctx, err, http.StatusConflict)
		}

		return ctx.Results.JSON(map[string]string{"phase": noskillsfx.PhaseBlocked})
	default:
		return ctx.Results.Error(http.StatusBadRequest,
			httpfx.WithSanitizedError(fmt.Errorf("unknown action %q (supported: next, approve, done, block)", action))) //nolint:err113
	}
}
