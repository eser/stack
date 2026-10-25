// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// `noskills next` (commands/next.ts): read the spec's state, apply an
// answer when one is given, touch lastCalledAt, and compile the instruction.

// ErrNeedsTypeScript means the step uses a part of noskills the Go build
// does not run yet; the CLI hands the whole command to the TypeScript CLI.
// Nothing has been written when it is returned.
var ErrNeedsTypeScript = errors.New("this step runs in the TypeScript noskills CLI")

// DiscoveryAnswerError is a JSON discovery answer noskills refuses; the
// message says why. `next` prints it as {"error": ...}.
type DiscoveryAnswerError struct{ Message string }

func (e *DiscoveryAnswerError) Error() string { return e.Message }

// NextOptions are the arguments of `noskills next`.
type NextOptions struct {
	// Spec is the --spec value ("" for none).
	Spec string
	// Answer is the --answer value; nil when there is none.
	Answer *string
	// Audience is "agent" or "human" from --agent or --human, or "".
	Audience string
	// Validate is --validate: run the validator on this call.
	Validate bool
	// Validators finds the judge for a validator agent. nil turns the
	// validator step off, --validate and the manifest's entry included.
	Validators ValidatorResolver
	// ValidationTimeout bounds the validator call; zero is ValidationTimeout.
	ValidationTimeout time.Duration
}

// NextResult is what `next` prints: the object as two-space JSON, and the
// exit code.
type NextResult struct {
	Output   *JSObject
	ExitCode int
}

func errorResult(message any) NextResult {
	return NextResult{Output: JSObjectOf("error", message), ExitCode: 1}
}

// CommandPrefixOf is the manifest's command, or DefaultCommandPrefix.
func CommandPrefixOf(manifest *JSObject) string {
	if command, ok := manifest.strOK("command"); ok && command != "" {
		return command
	}

	return DefaultCommandPrefix
}

// AgentToolOf is detectAgentTool: the coding tool the environment names, or "".
func (e *LifecycleEnv) AgentToolOf() string {
	checks := []struct{ name, tool string }{
		{"CLAUDE_CODE", CodingToolClaudeCode}, {"CLAUDECODE", CodingToolClaudeCode},
		{"CLAUDE_CODE_ENTRYPOINT", CodingToolClaudeCode}, {"CLAUDE_SESSION_ID", CodingToolClaudeCode},
		{"CURSOR_SESSION", CodingToolCursor}, {"CURSOR", CodingToolCursor},
		{"KIRO_SESSION", CodingToolKiro}, {"KIRO", CodingToolKiro},
		{"WINDSURF_SESSION", CodingToolWindsurf}, {"GITHUB_COPILOT", CodingToolCopilot},
	}

	for _, check := range checks {
		if value, ok := e.getenv(check.name); ok && value != "" {
			return check.tool
		}
	}

	return ""
}

// audienceOf is detectMode: the flag, then the manifest's agentMode, then
// the environment.
func (e *LifecycleEnv) audienceOf(flag string, manifest *JSObject) string {
	if flag != "" {
		return flag
	}

	switch mode, _ := manifest.get("agentMode"); mode {
	case true:
		return "agent"
	case false:
		return "human"
	}

	if e.AgentToolOf() != "" {
		return "agent"
	}

	return "human"
}

// activeConcernsOf are the project's concerns the manifest lists.
func activeConcernsOf(root string, manifest *JSObject, warn StateWarner) []ConcernDefinition {
	return filterConcernsByIDs(ListHookConcerns(root, warn), stringsOf(manifest.arr("concerns")))
}

// Next runs `noskills next`.
func Next(ctx context.Context, e *LifecycleEnv, opts NextOptions) (NextResult, error) { //nolint:cyclop,funlen // the order of commands/next.ts main
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	if !IsHookInitialized(root) {
		return errorResult("noskills not initialized. Run: " + prefix + " init"), nil
	}

	state, err := ResolveState(root, opts.Spec, prefix, e.Warn)
	if err != nil {
		var notFound *SpecNotFoundError
		if errors.As(err, &notFound) {
			return errorResult(err.Error()), nil
		}

		return NextResult{}, err
	}

	phase := phaseOf(state)
	if opts.Spec == "" && phase != PhaseIdle && phase != PhaseCompleted {
		active := "<name>"
		if spec, ok := state.strOK("spec"); ok {
			active = spec
		}

		return errorResult("Error: the spec name is required while a spec is active. Run `" + prefix + " spec " + active +
			" next`, or `" + prefix + " spec list` to see the other specs."), nil
	}

	if manifest == nil {
		return errorResult("No config found"), nil
	}

	if spec, ok := state.strOK("spec"); ok && phase != PhaseIdle && phase != PhaseCompleted && !specDirExists(root, spec) {
		return NextResult{Output: JSObjectOf(
			"error", true,
			"message", "Active spec '"+spec+"' directory not found. Files may have been deleted manually.",
			"suggestion", "Run `"+prefix+" spec "+spec+" reset` to return to idle, or `"+prefix+" spec "+spec+" cancel` to mark as cancelled.",
		), ExitCode: 1}, nil
	}

	audience := e.audienceOf(opts.Audience, manifest)
	if phase == PhaseDiscovery && discoveryOf(state).str("audience") != audience {
		state = withDiscovery(state, "audience", audience)
	}

	run := &nextRun{env: e, root: root, manifest: manifest, prefix: prefix, active: activeConcernsOf(root, manifest, e.Warn)}

	if opts.Answer == nil {
		touched := state.with("lastCalledAt", e.nowISO())
		if err := WriteStateAndSpec(root, touched, e.Warn); err != nil {
			return NextResult{}, err
		}

		run.updateSession(touched)

		return NextResult{Output: run.withValidation(ctx, touched, run.compile(ctx, touched, true), &opts), ExitCode: 0}, nil
	}

	answer := *opts.Answer

	next, err := run.handleAnswer(ctx, state, answer)
	if err != nil {
		var refused *DiscoveryAnswerError
		if errors.As(err, &refused) {
			return errorResult(refused.Message), nil
		}

		var splitRefused *SplitRefusedError
		if errors.As(err, &splitRefused) {
			return errorResult(splitRefused.Message), nil
		}

		return NextResult{}, err
	}

	if err := WriteStateAndSpec(root, next, e.Warn); err != nil {
		return NextResult{}, err
	}

	touched := next.with("lastCalledAt", e.nowISO())
	if err := WriteStateAndSpec(root, touched, e.Warn); err != nil {
		return NextResult{}, err
	}

	run.updateSession(touched)

	output := run.withValidation(ctx, touched, run.compile(ctx, touched, false), &opts)

	if strings.ToLower(jsTrim(answer)) == "save" && phaseOf(touched) == phase &&
		(phase == PhaseSpecProposal || phase == PhaseSpecApproved) {
		saved := "<name>"
		if spec, ok := touched.strOK("spec"); ok {
			saved = spec
		}

		instruction := "Spec is approved and parked. Others can still add ACs or notes. When ready, run `" + prefix +
			" spec " + saved + ` next --answer="start"` + "` to begin execution."
		if phase == PhaseSpecProposal {
			instruction = "Spec draft saved. The spec stays in DRAFT and can be reviewed by anyone. Other users can add ACs (`ac add`), notes (`note add`), or tasks (`task add`) while in draft. When ready, any user can approve with `" +
				prefix + " spec " + saved + " approve`."
		}

		output = output.with("instruction", instruction, "saved", true)
	}

	return NextResult{Output: output, ExitCode: 0}, nil
}

// nextRun is one `next` call's context.
type nextRun struct {
	env      *LifecycleEnv
	root     string
	manifest *JSObject
	prefix   string
	active   []ConcernDefinition
}

func (r *nextRun) updateSession(state *JSObject) {
	if session, ok := r.env.getenv("NOSKILLS_SESSION"); ok {
		_ = UpdateSessionPhase(r.root, session, phaseOf(state), r.env.now())
	}
}

// compile builds the instruction; idle adds the spec list, which only the
// call without an answer does.
func (r *nextRun) compile(ctx context.Context, state *JSObject, idle bool) *JSObject {
	phase := phaseOf(state)
	tier1, tier2 := splitRulesByTier(LoadScopedRules(r.root), phase)

	var parsed *ParsedSpec
	if spec, ok := state.strOK("spec"); ok {
		parsed = ReadParsedSpec(r.root, spec)
	}

	touched := stringsOf(executionOf(state).arr("modifiedFiles"))
	for _, file := range readTrackedFiles(r.root) {
		if !containsString(touched, file) {
			touched = append(touched, file)
		}
	}

	var idleContext *IdleContext
	if idle && phase == PhaseIdle {
		idleContext = &IdleContext{ExistingSpecs: existingSpecs(r.root, r.env.Warn), RulesCount: len(tier1)}
	}

	user := r.env.ResolveUser(ctx)

	return CompileNext(&NextInput{
		State:          state,
		ActiveConcerns: r.active,
		Rules:          tier1,
		Manifest:       r.manifest,
		Parsed:         parsed,
		FolderRules:    CollectFolderRules(r.root, touched),
		Idle:           idleContext,
		Hints:          ResolveInteractionHints(stringsOf(r.manifest.arr("tools"))),
		CurrentUser:    &user,
		Tier2Count:     tier2,
		ProjectRoot:    r.root,
		CommandPrefix:  r.prefix,
		Now:            r.env.now(),
	})
}

// existingSpecs are the IDLE output's spec list.
func existingSpecs(root string, warn StateWarner) []*JSObject {
	entries := ListSpecStateObjects(root, warn)
	specs := make([]*JSObject, 0, len(entries))

	for _, entry := range entries {
		execution := executionOf(entry.State)
		spec := JSObjectOf("name", entry.Name, "phase", entry.State.getOr("phase"), "iteration", execution.getOr("iteration"))

		switch phaseOf(entry.State) {
		case PhaseExecuting:
			spec.set("detail", jsNumberString(float64(len(execution.arr("completedTasks"))))+" tasks done, iteration "+
				jsDisplay(execution.getOr("iteration")))
		case PhaseSpecProposal:
			spec.set("detail", "awaiting approval")
		case PhaseCompleted:
			spec.set("detail", "completed")
		}

		specs = append(specs, spec)
	}

	return specs
}

// splitRulesByTier is splitByTier: the rule texts of the phase without a
// file scope, and how many have one.
func splitRulesByTier(rules []ScopedRule, phase string) (tier1 []string, tier2 int) {
	for _, rule := range rules {
		if len(rule.Phases) > 0 && !containsString(rule.Phases, phase) {
			continue
		}

		if len(rule.AppliesTo) > 0 {
			tier2++
		} else {
			tier1 = append(tier1, rule.Text)
		}
	}

	return tier1, tier2
}

// ruleTexts is loadRules: every rule's text.
func ruleTexts(rules []ScopedRule) []string {
	texts := make([]string, len(rules))
	for i, rule := range rules {
		texts[i] = rule.Text
	}

	return texts
}

func (r *nextRun) handleAnswer(ctx context.Context, state *JSObject, answer string) (*JSObject, error) {
	switch phaseOf(state) {
	case PhaseDiscovery:
		return r.discoveryAnswer(ctx, state, answer)
	case PhaseDiscoveryRefinement:
		return r.refinementAnswer(ctx, state, answer)
	case PhaseSpecProposal:
		return r.proposalAnswer(state, answer), nil
	case PhaseSpecApproved:
		if strings.ToLower(jsTrim(answer)) == "save" {
			return state, nil
		}

		next, err := startExecutionState(state)
		if err != nil {
			return nil, err
		}

		if spec, ok := next.strOK("spec"); ok && validSpecPathName(spec) {
			updateSpecStatus(r.root, spec, "executing")
			updateProgressStatus(r.root, spec, "executing", r.env.nowISO())

			dir := filepath.Join(r.root, specsDir, spec)
			_ = createSpecSnapshot(filepath.Join(dir, "spec.md"), filepath.Join(dir, "spec.approved.md"))
		}

		return next, nil
	case PhaseExecuting:
		return r.executionAnswer(ctx, state, answer), nil
	case PhaseBlocked:
		reason := "Unknown"
		if value := executionOf(state).getOr("lastProgress"); value != nil {
			reason = jsDisplay(value)
		}

		decision := JSObjectOf(
			"id", "d"+jsNumberString(float64(len(state.arr("decisions"))+1)),
			"question", blockedPrefix.ReplaceAllLiteralString(reason, ""),
			"choice", answer,
			"promoted", false,
			"timestamp", r.env.nowISO(),
		)

		next, err := transitionState(addDecisionState(state, decision), PhaseExecuting)
		if err != nil {
			return nil, err
		}

		return withExecution(next, "lastProgress", "Resolved: "+answer), nil
	default:
		return state, nil
	}
}

var blockedPrefix = regexp.MustCompile(`^BLOCKED:` + jsSpace + `*`) //nolint:gochecknoglobals // compiled once

func validDiscoveryMode(mode string) bool {
	switch mode {
	case DiscoveryModeFull, DiscoveryModeValidate, DiscoveryModeTechnicalDepth, DiscoveryModeShipFast, DiscoveryModeExplore:
		return true
	default:
		return false
	}
}

func (r *nextRun) discoveryAnswer(ctx context.Context, state *JSObject, answer string) (*JSObject, error) { //nolint:cyclop,funlen,gocognit // the stages of handleAnswer's DISCOVERY case
	discovery := discoveryOf(state)
	hasUserContext := listLength(discovery.getOr("userContext")) > 0
	description, _ := state.get("specDescription")
	hasDescription := description != nil && listLength(description) > 0
	_, hasMode := discovery.get("mode")
	user := r.env.ResolveUser(ctx)

	if !hasUserContext && !hasMode && hasDescription {
		if jsTrim(answer) == "import-plan" {
			if detected := detectActivePlan(r.root, r.env.now()); detected != nil {
				if data, err := os.ReadFile(filepath.FromSlash(detected.path)); err == nil { //nolint:gosec // G304: the plan file the detector found
					return importDetectedPlan(state, string(data), detected.path), nil
				}
			}

			return setUserContext(state, "⚠ No active plan found — plan.md was not detected or has expired. Please share your context directly."), nil
		}

		return setUserContext(state, answer), nil
	}

	if !hasMode && hasDescription {
		mode := DiscoveryModeFull
		if validDiscoveryMode(answer) {
			mode = answer
		}

		return setDiscoveryMode(state, mode)
	}

	if hasMode && !discovery.isTrue("premisesCompleted") {
		return r.premisesAnswer(state, answer, user)
	}

	answers, err := discoveryAnswersOf(answer)
	if err != nil {
		return nil, err
	}

	next := state

	if answers != nil {
		ids := answers.Keys()
		tokens := r.consumeAskTokens(state, ids)
		unconfirmed := false

		for _, id := range ids {
			text, _ := answers.strOK(id)

			token, ok := tokens[id]
			if !ok {
				token = notAsked()
			}

			if token.source != "STATED" {
				unconfirmed = true
			}

			if next, err = addDiscoveryAnswer(next, id, text, user, r.env.nowISO()); err != nil {
				return nil, err
			}

			next = applyTokenSource(next, id, token)
			next = r.applyLivingSpec(next, id, text, user)
		}

		next = withDiscovery(next, "batchSubmitted", discoveryOf(next).isTrue("batchSubmitted") || unconfirmed)
	} else {
		answered := answeredQuestionIDs(discoveryOf(next).arr("answers"))

		var current *QuestionWithExtras

		for _, q := range GetQuestionsWithExtras(r.active) {
			if !answered[q.ID] {
				current = &q

				break
			}
		}

		if current == nil {
			return state, nil
		}

		if next, err = addDiscoveryAnswer(next, current.ID, answer, user, r.env.nowISO()); err != nil {
			return nil, err
		}

		token, ok := r.consumeAskTokens(state, []string{current.ID})[current.ID]
		if !ok {
			token = notAsked()
		}

		next = applyTokenSource(next, current.ID, token)

		if next, err = advanceDiscoveryQuestion(next); err != nil {
			return nil, err
		}

		next = r.applyLivingSpec(next, current.ID, answer, user)
	}

	return completeDiscoveryWhenReady(next)
}

// premisesAnswer is the premise challenge: a JSON object with a non-empty
// premises list, or an error asking for one.
func (r *nextRun) premisesAnswer(state *JSObject, answer string, user User) (*JSObject, error) {
	invalid := lifecycleError("Premise challenge requires valid JSON with premises array. Re-prompt the user.")

	parsed, err := parseJSON(answer)
	if err != nil {
		return nil, invalid
	}

	o, isObject := parsed.(*JSObject)
	if !isObject || !o.hasKey("premises") {
		return nil, lifecycleError("Premise challenge requires a premises array. Cannot skip with empty input.")
	}

	raw, isList := o.getOr("premises").([]any)
	if !isList {
		return nil, invalid
	}

	premises := make([]any, 0, len(raw))

	for _, item := range raw {
		if item == nil {
			return nil, invalid
		}

		p, _ := item.(*JSObject)

		text := p.getOr("text")
		if text == nil {
			text = ""
		}

		agreed := p.getOr("agreed")
		if agreed == nil {
			agreed = true
		}

		premise := JSObjectOf("text", text, "agreed", agreed)
		if revision, ok := p.get("revision"); ok {
			premise.set("revision", revision)
		}

		premise.set("user", user.Name)
		premise.set("timestamp", r.env.nowISO())
		premises = append(premises, premise)
	}

	if len(premises) == 0 {
		return nil, invalid
	}

	next, err := completePremises(state, premises)
	if err != nil {
		return nil, invalid
	}

	return next, nil
}

// hasKey is the `in` operator: the key exists, whatever its value.
func (o *JSObject) hasKey(key string) bool {
	if o == nil {
		return false
	}

	_, ok := o.values[key]

	return ok
}

// discoveryAnswersOf is discoveryAnswersOf in context/questions.ts: the
// answers a JSON object holds, keyed by question id, or nil when the answer
// is not a JSON object.
func discoveryAnswersOf(answer string) (*JSObject, error) {
	parsed, err := parseJSON(answer)
	if err != nil {
		return nil, nil //nolint:nilnil // nil means a plain-text answer
	}

	o, ok := parsed.(*JSObject)
	if !ok {
		return nil, nil //nolint:nilnil // nil means a plain-text answer
	}

	ids := make([]string, len(questions))
	for i, q := range questions {
		ids[i] = q.ID
	}

	idList := strings.Join(ids, ", ")
	answers := NewJSObject()

	for _, id := range o.Keys() {
		value := o.values[id]

		if !containsString(ids, id) {
			return nil, &DiscoveryAnswerError{Message: `Cannot record the discovery answers: "` + id +
				`" is not a question id. Key each answer by one of: ` + idList + "."}
		}

		text, isString := value.(string)
		if !isString {
			return nil, &DiscoveryAnswerError{Message: `Cannot record the discovery answers: the answer to "` + id +
				`" is not a string. Send each answer as text.`}
		}

		if text != "" {
			answers.set(id, text)
		}
	}

	if len(answers.keys) == 0 {
		return nil, &DiscoveryAnswerError{Message: "Cannot record the discovery answers: the object holds no answer. Key each answer by one of: " + idList + "."}
	}

	return answers, nil
}

// askTokenResult is where an answer came from: STATED when the ask token
// records that the user was asked.
type askTokenResult struct {
	source string
	match  string
}

func notAsked() askTokenResult { return askTokenResult{source: "INFERRED", match: "not-asked"} }

// consumeAskTokens takes the steps of the expected ids from the ask token;
// a taken step is used up, and the file goes once none are left.
func (r *nextRun) consumeAskTokens(state *JSObject, expected []string) map[string]askTokenResult {
	taken := map[string]askTokenResult{}
	path := AskTokenFile(r.root)

	data, err := os.ReadFile(path) //nolint:gosec // G304: the ask token of the project
	if err != nil {
		return taken
	}

	spec, hasSpec := state.strOK("spec")

	steps, ok := ValidAskTokenSteps(string(data), spec, hasSpec, r.env.now())
	if !ok {
		return taken
	}

	left := []any{}

	for _, item := range steps {
		step, _ := item.(*JSObject)

		id := step.str("stepId")
		if _, already := taken[id]; containsString(expected, id) && !already {
			taken[id] = askTokenResult{source: "STATED", match: step.str("match")}
		} else {
			left = append(left, item)
		}
	}

	if len(taken) == 0 {
		return taken
	}

	if len(left) == 0 {
		_ = os.Remove(path)
	} else if parsed, err := parseJSON(string(data)); err == nil {
		if token, isObject := parsed.(*JSObject); isObject {
			_ = os.WriteFile(path, []byte(jsonStringify(token.with("steps", left))+"\n"), stateFilePerm) //nolint:gosec // G306: the token is not secret
		}
	}

	return taken
}

// applyTokenSource marks the question's newest answer with where it came from.
func applyTokenSource(state *JSObject, questionID string, token askTokenResult) *JSObject {
	answers := discoveryOf(state).arr("answers")

	for i := len(answers) - 1; i >= 0; i-- {
		answer, ok := answers[i].(*JSObject)
		if !ok || answer.str("questionId") != questionID {
			continue
		}

		normalized := answer
		if !answer.hasKey("user") || !answer.hasKey("timestamp") {
			normalized = JSObjectOf("questionId", answer.getOr("questionId"), "answer", answer.getOr("answer"),
				"user", "Unknown User", "email", "", "timestamp", "", "type", "original")
		}

		updated := append([]any{}, answers...)
		updated[i] = normalized.with("source", token.source, "questionMatch", token.match)

		return withDiscovery(state, "answers", updated)
	}

	return state
}

func sameClassification(a, b *JSObject) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}

	for _, flag := range []string{"involvesWebUI", "involvesCLI", "involvesPublicAPI", "involvesMigration", "involvesDataHandling"} {
		left, _ := a.get(flag)
		right, _ := b.get(flag)

		if left != right {
			return false
		}
	}

	return true
}

// applyLivingSpec is applyLivingSpecToDiscoveryAnswer: the section the
// question fills, the classification inferred again, and spec.md updated.
// A spec.md that cannot be updated leaves the state change in place.
func (r *nextRun) applyLivingSpec(state *JSObject, questionID, answer string, user User) *JSObject {
	specState := state.objOrEmpty("specState")

	if spec, present := state.get("spec"); spec == nil && present {
		return state
	}

	if path, present := specState.get("path"); path == nil && present {
		return state
	}

	path := jsDisplay(specState.getOr("path"))
	sectionID := QuestionToSectionID(questionID)
	nowISO := r.env.nowISO()

	previous := state.obj("classification")
	classification := inferClassificationObject(state)
	changed := !sameClassification(previous, classification)
	sections := mergeLivingSections(r.active)

	oldPlaceholders := specState.arr("placeholders")
	placeholders := markPlaceholderFilled(oldPlaceholders, sectionID, user.Name, nowISO)
	placeholders = applyClassificationToPlaceholders(placeholders, sections, classification)
	metadata := applyMetadataAction(specState.objOrEmpty("metadata"), "answer", user.Name, nowISO)

	next := state.with("classification", classification,
		"specState", specState.with("placeholders", placeholders, "metadata", metadata))

	revealed, hidden := revealedAndHidden(oldPlaceholders, placeholders)

	var revealedSections []livingSection

	for _, id := range revealed {
		for _, section := range sections {
			if section.ID == id {
				revealedSections = append(revealedSections, section)

				break
			}
		}
	}

	_ = applyAnswerToFile(&livingAnswerUpdate{
		Path:            filepath.Join(r.root, filepath.FromSlash(path)),
		SectionID:       sectionID,
		Body:            answer,
		User:            user.Name,
		NowISO:          nowISO,
		Metadata:        metadata,
		Placeholders:    placeholders,
		Changed:         changed,
		RevealedSection: revealedSections,
		HiddenIDs:       hidden,
	})

	return next
}

func (r *nextRun) proposalAnswer(state *JSObject, answer string) *JSObject {
	if strings.ToLower(jsTrim(answer)) == "save" {
		return state
	}

	working := state

	if value, ok := state.get("classification"); ok && value == nil {
		working = autoClassifyIfMissing(working)
		_ = generateSpecDocument(r.root, working, r.active, r.env.nowISO())
	}

	parsed, err := parseJSON(answer)
	if err != nil {
		return working
	}

	o, _ := parsed.(*JSObject)

	refinement, ok := o.strOK("refinement")
	if !ok || refinement == "" {
		return working
	}

	spec, hasSpec := working.strOK("spec")
	if !hasSpec || !validSpecPathName(spec) {
		return working
	}

	file := specFilePath(r.root, spec)

	content, err := os.ReadFile(file) //nolint:gosec // G304: the spec of the project
	if err != nil {
		return working
	}

	if strings.Contains(refinement, "task-") {
		tasks := parseRefinementTasks(refinement)
		lines := make([]string, len(tasks))

		for i, task := range tasks {
			lines[i] = "- [ ] " + task
		}

		updated := replaceTasksSection(string(content), "## Tasks\n\n"+strings.Join(lines, "\n")+"\n")
		_ = os.WriteFile(file, []byte(updated), stateFilePerm) //nolint:gosec // G306: spec.md is not secret
	}

	return working
}

var (
	refinementTaskStart = regexp.MustCompile(`task-\d+:`)                    //nolint:gochecknoglobals // compiled once
	refinementTaskTail  = regexp.MustCompile(`[,;\n` + jsSpaceClass + `]+$`) //nolint:gochecknoglobals // compiled once
	refinementTaskHead  = regexp.MustCompile(`^task-\d+:`)                   //nolint:gochecknoglobals // compiled once
)

// parseRefinementTasks splits a refinement at each `task-N:`.
func parseRefinementTasks(text string) []string {
	var parts []string

	last := 0

	for _, loc := range refinementTaskStart.FindAllStringIndex(text, -1) {
		if loc[0] > last {
			parts = append(parts, text[last:loc[0]])
			last = loc[0]
		}
	}

	parts = append(parts, text[last:])

	var tasks []string

	for _, part := range parts {
		part = jsTrim(refinementTaskTail.ReplaceAllString(part, ""))
		if refinementTaskHead.MatchString(part) {
			tasks = append(tasks, part)
		}
	}

	return tasks
}

// replaceTasksSection is the `## Tasks` replace of the refinement answer:
// the section's body, up to the next `## ` heading or the trailing line
// breaks, becomes replacement (with `$` patterns read).
func replaceTasksSection(content, replacement string) string {
	start := strings.Index(content, "## Tasks\n\n")
	if start == -1 {
		return content
	}

	bodyStart := start + len("## Tasks\n\n")

	for end := bodyStart; end <= len(content); end++ {
		rest := content[end:]
		if !strings.HasPrefix(rest, "\n## ") && strings.Trim(rest, "\n") != "" {
			continue
		}

		before, after := content[:start], content[end:]
		group := content[bodyStart:end]

		return before + jsExpandReplacement(replacement, content[start:end], before, after, []string{group}) + after
	}

	return content
}
