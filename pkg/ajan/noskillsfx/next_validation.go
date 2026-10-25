// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"unicode/utf16"
)

// The validator step of `noskills next` (commands/next-validation.ts): at the
// end of discovery and at the spec proposal, `--validate` or the manifest's
// `validate` entry runs a second agent on the transition and adds its
// findings to the output. The result is stored per spec, so a later `next`
// on the same input repeats it instead of calling the agent again.

// ValidatorResolver finds the judge that runs an agent, or nil when no
// provider has that name.
type ValidatorResolver func(agent string) ValidationJudge

// validateFlag is the `next` flag that runs the validator on this call.
const validateFlag = "--validate"

// validationsDir holds the stored validator result of each spec.
const validationsDir = progressesDir + "/validations"

// The validated transitions, as transitionToValidate returns them.
func endOfDiscoveryTransition() ValidatedTransition {
	return ValidatedTransition{
		ID:       TransitionEndOfDiscovery,
		From:     PhaseDiscoveryRefinement,
		To:       PhaseSpecProposal,
		Approval: "The user confirms the discovery answers, and the spec draft is generated from them.",
	}
}

func specProposalTransition() ValidatedTransition {
	return ValidatedTransition{
		ID:       TransitionSpecProposal,
		From:     PhaseSpecProposal,
		To:       PhaseSpecApproved,
		Approval: "The user approves the spec draft, and its tasks and acceptance criteria become the work to execute and check.",
	}
}

// transitionOfState is transitionToValidate on a state object.
func transitionOfState(state *JSObject) *ValidatedTransition {
	switch phaseOf(state) {
	case PhaseDiscoveryRefinement:
		if !jsTruthy(discoveryOf(state).getOr("approved")) {
			t := endOfDiscoveryTransition()

			return &t
		}
	case PhaseSpecProposal:
		if value, ok := state.get("classification"); !ok || value != nil {
			t := specProposalTransition()

			return &t
		}
	}

	return nil
}

// describeManifestValue names a value for an error message without echoing
// it (describeValue).
func describeManifestValue(value any, present bool) string {
	if !present {
		return "missing"
	}

	switch v := value.(type) {
	case nil:
		return "empty"
	case string:
		if jsTrim(v) == "" {
			return "an empty string"
		}

		return "a string"
	case []any:
		return "a list"
	case bool:
		return "a boolean"
	case float64, int:
		return "a number"
	default:
		return "an object"
	}
}

// validatorSettingsOfValue is validatorSettingsOf: the manifest's `validate`
// entry as hand-edited YAML, checked; the defaults without an entry. The
// failure is the message that names the field and the fix, or "".
func validatorSettingsOfValue(entry any, present bool) (ValidatorSettings, string) {
	if !present {
		return ValidatorSettings{Agent: DefaultAgentProvider, Model: DefaultAgentModel}, ""
	}

	record, ok := entry.(*JSObject)
	if !ok {
		return ValidatorSettings{}, "noskills.validate in .eser/manifest.yml is " + describeManifestValue(entry, true) +
			"; set it to a mapping with agent and model, for example agent: " + DefaultAgentProvider +
			" and model: " + DefaultAgentModel + "."
	}

	agentValue, hasAgent := record.get("agent")
	agent, isString := agentValue.(string)

	if !isString || jsTrim(agent) == "" {
		return ValidatorSettings{}, "noskills.validate.agent in .eser/manifest.yml is " +
			describeManifestValue(agentValue, hasAgent) + "; set it to an @eserstack/ai provider: " + knownAgents + "."
	}

	modelValue, hasModel := record.get("model")
	model, isString := modelValue.(string)

	if !isString || jsTrim(model) == "" {
		return ValidatorSettings{}, "noskills.validate.model in .eser/manifest.yml is " +
			describeManifestValue(modelValue, hasModel) + "; set it to a model id that " + jsTrim(agent) +
			" runs, for example " + DefaultAgentModel + " for " + DefaultAgentProvider + "."
	}

	return ValidatorSettings{Agent: jsTrim(agent), Model: jsTrim(model)}, ""
}

// cutUnits is cut(): the text up to limit UTF-16 code units, and a note
// that it was cut.
func cutUnits(text string, limit int) string {
	if len(utf16.Encode([]rune(text))) <= limit {
		return text
	}

	return jsSliceUnits(text, limit) + "\n[cut at " + strconv.Itoa(limit) + " characters]"
}

// validationInputObject is validationInputOf: the transition, the spec and
// the answers, as the JSON object the validator reads.
func validationInputObject(state *JSObject, transition ValidatedTransition, document *string) *JSObject {
	order := []string{}
	texts := map[string][]string{}

	for _, entry := range objectsOf(discoveryOf(state).arr("answers")) {
		id := entry.str("questionId")
		if _, seen := texts[id]; !seen {
			order = append(order, id)
		}

		texts[id] = append(texts[id], entry.str("answer"))
	}

	answers := make([]any, 0, len(order))

	for _, id := range order {
		joined := ""

		for i, text := range texts[id] {
			if i > 0 {
				joined += "\n\n"
			}

			joined += text
		}

		answers = append(answers, JSObjectOf("questionId", id, "question", questionTextFor(id), "answer", cutUnits(joined, MaxAnswerChars)))
	}

	for _, followUp := range objectsOf(discoveryOf(state).arr("followUps")) {
		answer, isString := followUp.strOK("answer")
		if followUp.str("status") == "answered" && isString {
			answers = append(answers, JSObjectOf("questionId", followUp.getOr("id"), "question", followUp.getOr("question"),
				"answer", cutUnits(answer, MaxAnswerChars)))
		}
	}

	name := ""
	if spec, ok := state.strOK("spec"); ok {
		name = spec
	}

	spec := JSObjectOf("name", name)
	if description, ok := state.get("specDescription"); ok {
		spec.set("description", description)
	}

	if document == nil {
		spec.set("document", nil)
	} else {
		spec.set("document", cutUnits(*document, MaxSpecDocumentChars))
	}

	return JSObjectOf(
		"transition", JSObjectOf("id", string(transition.ID), "from", transition.From, "to", transition.To,
			"approval", transition.Approval),
		"spec", spec,
		"answers", answers,
	)
}

// validationKey is validationKeyOf: the SHA-256 of the input and the
// settings, so a stored result stands in for a new call until one changes.
func validationKey(input *JSObject, settings ValidatorSettings) string {
	payload := JSObjectOf("input", input, "settings", JSObjectOf("agent", settings.Agent, "model", settings.Model))
	sum := sha256.Sum256([]byte(jsonStringify(payload)))

	return hex.EncodeToString(sum[:])
}

// validationValue is a validation as the JSON value the output carries.
func validationValue(validation *TransitionValidation) any {
	data, err := validation.MarshalJSON()
	if err != nil {
		return nil
	}

	value, err := parseJSON(string(data))
	if err != nil {
		return nil
	}

	return value
}

// attachValidationValue is attachValidation for a validation value.
func attachValidationValue(out *JSObject, validation any) *JSObject {
	if instruction, ok := out.strOK("instruction"); ok {
		return out.with("instruction", instruction+" A second agent checked this transition: follow `validation.instruction` before you ask the user for approval.",
			"validation", validation)
	}

	return out.with("validation", validation)
}

// readSpecDocumentFor is readSpecDocument: the spec document the validator
// sees, nil when there is none yet, or the reason it could not be read. The
// file is read inside the project root.
func readSpecDocumentFor(root, relative string) (*string, string) {
	project, err := os.OpenRoot(root)
	if err != nil {
		return nil, relative + " could not be read: " + err.Error() + "."
	}
	defer project.Close() //nolint:errcheck // read-only

	data, err := project.ReadFile(filepath.FromSlash(relative))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ""
	}

	if err != nil {
		return nil, relative + " could not be read: " + err.Error() + "."
	}

	text := string(data)

	return &text, ""
}

// storedValidation is storedValidationOf: the stored record's key and
// validation, or false when the record has another shape.
func storedValidation(root, spec string) (string, any, bool) {
	if !validSpecPathName(spec) {
		return "", nil, false
	}

	data, err := os.ReadFile(filepath.Join(root, validationsDir, spec+".json")) //nolint:gosec // G304: the spec's own record, by a checked name
	if err != nil {
		return "", nil, false
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		return "", nil, false
	}

	record, ok := parsed.(*JSObject)
	if !ok {
		return "", nil, false
	}

	key, isString := record.strOK("key")
	validation := record.obj("validation")

	if !isString || validation == nil {
		return "", nil, false
	}

	if status := validation.str("status"); status != string(ValidationReviewed) && status != string(ValidationSkipped) {
		return "", nil, false
	}

	return key, validation, true
}

// writeValidationRecord is writeValidationRecord: the latest result for a
// spec, replacing the one before.
func writeValidationRecord(root, spec, key string, validation any) error {
	if !validSpecPathName(spec) {
		return &SpecNotFoundError{Name: spec, CommandPrefix: DefaultCommandPrefix}
	}

	dir := filepath.Join(root, validationsDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err //nolint:wrapcheck // the notice names the file
	}

	record := JSObjectOf("key", key, "validation", validation)

	return writeFileAtomic(filepath.Join(dir, spec+".json"), stateJSON(record), stateFilePerm) //nolint:wrapcheck // the notice names the file
}

// withValidation adds the second agent's findings to a `next` output at the
// end of discovery and at the spec proposal, when --validate or the
// manifest asks for them. Without a resolver (noskills-server, the FFI
// bridge) it does nothing.
func (r *nextRun) withValidation(ctx context.Context, state, output *JSObject, opts *NextOptions) *JSObject {
	if opts.Validators == nil {
		return output
	}

	validation := r.validationFor(ctx, state, opts)
	if validation == nil {
		return output
	}

	return attachValidationValue(output, validation)
}

// validationFor is validationFor in commands/next-validation.ts: the
// validation to add, or nil when nobody asked for one or the state is at no
// validated transition.
func (r *nextRun) validationFor(ctx context.Context, state *JSObject, opts *NextOptions) any { //nolint:cyclop,funlen // the steps of validationFor, in order
	entry, hasEntry := r.manifest.get("validate")
	if !opts.Validate && !hasEntry {
		return nil
	}

	transition := transitionOfState(state)
	spec, hasSpec := state.strOK("spec")

	if transition == nil || !hasSpec {
		if opts.Validate {
			r.env.notice("noskills: " + validateFlag + " has nothing to check in " + jsDisplay(state.getOr("phase")) +
				"; the validator runs at the end of discovery and at the spec proposal, before the approval.")
		}

		return nil
	}

	retryCommand := r.prefix + " spec " + spec + " next " + validateFlag

	settings, failure := validatorSettingsOfValue(entry, hasEntry)
	if failure != "" {
		skipped := NewSkippedValidation(*transition, nil, failure, retryCommand)

		return validationValue(&skipped)
	}

	skip := func(reason string) any {
		skipped := NewSkippedValidation(*transition, &settings, reason, retryCommand)

		return validationValue(&skipped)
	}

	relative := specsDir + "/" + spec + "/spec.md"
	if path, ok := state.objOrEmpty("specState").strOK("path"); ok {
		relative = path
	}

	document, unreadable := readSpecDocumentFor(r.root, relative)
	if unreadable != "" {
		return skip(unreadable)
	}

	input := validationInputObject(state, *transition, document)
	key := validationKey(input, settings)

	if !opts.Validate {
		if storedKey, stored, ok := storedValidation(r.root, spec); ok && storedKey == key {
			return stored
		}
	}

	timeout := opts.ValidationTimeout
	if timeout <= 0 {
		timeout = ValidationTimeout
	}

	r.env.notice("noskills: " + settings.Agent + " (" + settings.Model + ") is checking the " + string(transition.ID) +
		" transition; this can take up to " + strconv.FormatFloat(timeout.Seconds(), 'f', -1, 64) + " seconds.")

	validation := runInEmptyDirectory(func(workDir string) any {
		result := validateWithPrompt(ctx, opts.Validators(settings.Agent), &validatorCall{
			transition:   *transition,
			settings:     settings,
			prompt:       jsonStringifyIndent(input),
			timeout:      timeout,
			retryCommand: retryCommand,
			workDir:      workDir,
		})

		return validationValue(&result)
	}, skip)

	if err := writeValidationRecord(r.root, spec, key, validation); err != nil {
		r.env.notice("noskills: the validator result was not stored in " + validationsDir + "/" + spec +
			".json, so the next call runs the validator again: " + err.Error())
	}

	return validation
}

// runInEmptyDirectory runs work with a new empty directory, so a CLI agent
// started there finds none of the project's files, rules or hooks, and
// removes the directory afterwards.
func runInEmptyDirectory(work func(workDir string) any, skip func(reason string) any) any {
	workDir, err := os.MkdirTemp("", "noskills-validator-")
	if err != nil {
		return skip("no empty directory could be created for the validator: " + err.Error() + ".")
	}

	defer func() { _ = os.RemoveAll(workDir) }()

	return work(workDir)
}
