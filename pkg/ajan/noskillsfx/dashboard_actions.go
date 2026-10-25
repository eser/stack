// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"fmt"
	"strconv"
)

// The dashboard actions change a spec from the web dashboard
// (dashboard/actions.ts): each one changes the spec's state the way the
// lifecycle does and appends a dashboard event. A refusal the action decides
// on is a *DashboardRejection, whose message is safe to show the user; any
// other error is a fault whose message may name host paths.

// DashboardRejection is a refusal a dashboard action decided on, such as
// approving a spec in the wrong phase. It is ActionRejectedError.
type DashboardRejection struct {
	Message string
}

func (r *DashboardRejection) Error() string { return r.Message }

// IsDashboardRejection reports whether err is a *DashboardRejection and
// returns it.
func IsDashboardRejection(err error) (*DashboardRejection, bool) {
	return errors.AsType[*DashboardRejection](err)
}

// dashboardSpecState is resolveSpecState: the spec's state, with the
// configured command prefix in the not-found message.
func dashboardSpecState(e *LifecycleEnv, specName string) (*JSObject, error) {
	manifest, _ := readManifestSection(e.Root)

	return ResolveState(e.Root, specName, CommandPrefixOf(manifest), e.Warn)
}

// dashboardUser is the acting user: the one the request names, or the
// resolved identity.
func dashboardUser(ctx context.Context, e *LifecycleEnv, user *User) User {
	if user != nil {
		return *user
	}

	return e.ResolveUser(ctx)
}

// withDashboardNote is addSpecNote: the state with a note appended.
func withDashboardNote(state *JSObject, text string, user User, nowISO string) *JSObject {
	existing := state.arr("specNotes")
	note := JSObjectOf(
		"id", "note-"+strconv.Itoa(len(existing)+1),
		"text", text,
		"user", user.Name,
		"email", user.Email,
		"timestamp", nowISO,
		"phase", phaseOf(state),
	)

	return state.with("specNotes", appendAny(existing, note))
}

// writeDashboardNote adds a note to the spec, then appends the event that
// event builds for the acting user.
func writeDashboardNote(ctx context.Context, e *LifecycleEnv, specName, text string, user *User, event func(acting User) *JSObject) error {
	state, err := dashboardSpecState(e, specName)
	if err != nil {
		return err
	}

	acting := dashboardUser(ctx, e, user)

	if err := WriteSpecStateObject(e.Root, specName, withDashboardNote(state, text, acting, e.nowISO()), e.Warn); err != nil {
		return err
	}

	return AppendDashboardEvent(e.Root, event(acting))
}

// DashboardApprove is approve: SPEC_PROPOSAL to SPEC_APPROVED, recorded in the
// transition history and as a phase-change event.
func DashboardApprove(ctx context.Context, e *LifecycleEnv, specName string, user *User) error {
	state, err := dashboardSpecState(e, specName)
	if err != nil {
		return err
	}

	if phase := phaseOf(state); phase != PhaseSpecProposal {
		return &DashboardRejection{Message: "Cannot approve in phase: " + phase}
	}

	acting := dashboardUser(ctx, e, user)

	approved, err := approveSpecState(state)
	if err != nil {
		return fmt.Errorf("approve spec %q: %w", specName, err)
	}

	approved = recordTransition(approved, PhaseSpecProposal, PhaseSpecApproved, acting, e.nowISO())

	if err := WriteSpecStateObject(e.Root, specName, approved, e.Warn); err != nil {
		return err
	}

	return AppendDashboardEvent(e.Root, JSObjectOf(
		"ts", e.nowISO(), "type", DashboardEventPhaseChange, "spec", specName, "user", acting.Name,
		"from", PhaseSpecProposal, "to", PhaseSpecApproved,
	))
}

// DashboardAddNote is addNote: a spec note and a note event.
func DashboardAddNote(ctx context.Context, e *LifecycleEnv, specName, text string, user *User) error {
	return writeDashboardNote(ctx, e, specName, text, user, func(acting User) *JSObject {
		return JSObjectOf("ts", e.nowISO(), "type", DashboardEventNote, "spec", specName, "user", acting.Name, "text", text)
	})
}

// DashboardAddQuestion is addQuestion: a "[QUESTION] " note and a mention
// event, whose id the replies name.
func DashboardAddQuestion(ctx context.Context, e *LifecycleEnv, specName, text string, user *User) error {
	return writeDashboardNote(ctx, e, specName, dashboardQuestionPrefix+text, user, func(acting User) *JSObject {
		return JSObjectOf(
			"ts", e.nowISO(), "type", DashboardEventMention, "spec", specName, "user", acting.Name,
			"from", acting.Name, "to", "", "question", text,
			"id", "mention-"+strconv.FormatInt(e.now().UnixMilli(), 10),
		)
	})
}

// DashboardSignoff is signoff: a signed reviewer sign-off event. It reads no
// state, so it does not check that the spec exists.
func DashboardSignoff(ctx context.Context, e *LifecycleEnv, specName string, user *User) error {
	acting := dashboardUser(ctx, e, user)

	return AppendDashboardEvent(e.Root, JSObjectOf(
		"ts", e.nowISO(), "type", DashboardEventSignoff, "spec", specName, "user", acting.Name,
		"role", "reviewer", "status", "signed",
	))
}

// DashboardReplyMention is replyMention: a "[REPLY:<id>] " note and a
// mention-reply event.
func DashboardReplyMention(ctx context.Context, e *LifecycleEnv, specName, mentionID, text string, user *User) error {
	return writeDashboardNote(ctx, e, specName, "[REPLY:"+mentionID+"] "+text, user, func(acting User) *JSObject {
		return JSObjectOf(
			"ts", e.nowISO(), "type", DashboardEventMentionReply, "spec", specName, "user", acting.Name,
			"mentionId", mentionID, "text", text,
		)
	})
}

// DashboardComplete is complete: EXECUTING to COMPLETED in the spec's state,
// the global state back to IDLE, spec.md marked completed, and a
// phase-change event.
func DashboardComplete(ctx context.Context, e *LifecycleEnv, specName string, user *User) error {
	state, err := dashboardSpecState(e, specName)
	if err != nil {
		return err
	}

	if phase := phaseOf(state); phase != PhaseExecuting {
		return &DashboardRejection{Message: "Cannot complete in phase: " + phase}
	}

	acting := dashboardUser(ctx, e, user)

	completed, err := completeSpecState(state, "done", "", e.nowISO())
	if err != nil {
		return fmt.Errorf("complete spec %q: %w", specName, err)
	}

	completed = recordTransition(completed, PhaseExecuting, PhaseCompleted, acting, e.nowISO())

	if err := WriteSpecStateObject(e.Root, specName, completed, e.Warn); err != nil {
		return err
	}

	idle, err := resetToIdleState(completed)
	if err != nil {
		return fmt.Errorf("reset the active state after spec %q: %w", specName, err)
	}

	if err := WriteStateObject(e.Root, idle); err != nil {
		return err
	}

	// Best effort, as in actions.ts: both leave a spec without spec.md alone.
	updateSpecStatus(e.Root, specName, "completed")
	updateProgressStatus(e.Root, specName, "completed", e.nowISO())

	return AppendDashboardEvent(e.Root, JSObjectOf(
		"ts", e.nowISO(), "type", DashboardEventPhaseChange, "spec", specName, "user", acting.Name,
		"from", PhaseExecuting, "to", PhaseCompleted,
	))
}
