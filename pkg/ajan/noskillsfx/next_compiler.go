// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"strings"
	"time"
)

// The compiler of `noskills next` (context/compiler.ts compile): state,
// concerns and rules in, the agent's instruction object out. The object is
// built key by key in the order JSON.stringify gives the TypeScript object,
// so the printed JSON is the same text.

// NextInput is everything compile() reads.
type NextInput struct {
	State          *JSObject
	ActiveConcerns []ConcernDefinition
	// Rules are the rule texts that apply in every file (tier 1).
	Rules []string
	// Manifest is the manifest's noskills section, or nil.
	Manifest *JSObject
	// Parsed is the spec document, or nil.
	Parsed *ParsedSpec
	// FolderRules are the .folder-rules.md rules of the touched files.
	FolderRules []FolderRule
	// Idle is the IDLE context (the spec list), or nil.
	Idle  *IdleContext
	Hints InteractionHints
	// CurrentUser is the user who runs the command, or nil.
	CurrentUser *User
	// Tier2Count is the number of file-scoped rules.
	Tier2Count int
	// ProjectRoot is the root for the plan, learnings and diagram lookups;
	// "" skips them, as the TypeScript compile does without projectRoot.
	ProjectRoot   string
	CommandPrefix string
	Now           time.Time
}

// IdleContext is what IDLE shows: the existing specs and the rule count.
type IdleContext struct {
	ExistingSpecs []*JSObject
	RulesCount    int
}

type compiler struct {
	in   *NextInput
	spec string
	// hasSpec is false when state.spec is null.
	hasSpec bool
}

func (c *compiler) cmd(sub string) string { return c.in.CommandPrefix + " " + sub }

// cs is cs(sub, state.spec): spec-scoped when a spec is active.
func (c *compiler) cs(sub string) string {
	if !c.hasSpec {
		return c.cmd(sub)
	}

	return c.cmd("spec " + c.spec + " " + sub)
}

// csScoped is cs(sub, specScoped): the <name> placeholder without a spec.
func (c *compiler) csScoped(sub string) string {
	name := c.spec
	if !c.hasSpec {
		name = "<name>"
	}

	return c.cmd("spec " + name + " " + sub)
}

func (c *compiler) state() *JSObject { return c.in.State }

func (c *compiler) phase() string { return phaseOf(c.in.State) }

func (c *compiler) classification() *SpecClassification {
	return classificationFromObject(c.in.State.obj("classification"))
}

func (c *compiler) activeIDs() []any {
	ids := make([]any, len(c.in.ActiveConcerns))
	for i, concern := range c.in.ActiveConcerns {
		ids[i] = concern.ID
	}

	return ids
}

// CompileNext is compile(): the output of `noskills next` for the state.
func CompileNext(in *NextInput) *JSObject {
	spec, hasSpec := in.State.strOK("spec")
	c := &compiler{in: in, spec: spec, hasSpec: hasSpec}

	meta := c.meta()
	behavioral := c.behavioral()

	if c.phase() == PhaseExecuting {
		_, tier2 := SplitRemindersByTier(in.ActiveConcerns, c.classification())
		if total := in.Tier2Count + len(tier2); total > 0 {
			behavioral = behavioral.with("tier2Summary",
				jsNumberString(float64(total))+" file-specific rules delivered via PreToolUse hook when editing matching files.")
		}
	}

	var phaseOutput *JSObject

	switch c.phase() {
	case PhaseDiscovery:
		phaseOutput = c.discovery()
	case PhaseDiscoveryRefinement:
		phaseOutput = c.discoveryReview()
	case PhaseSpecProposal:
		phaseOutput = c.specDraft()
	case PhaseSpecApproved:
		phaseOutput = c.specApproved()
	case PhaseExecuting:
		phaseOutput = c.execution()
	case PhaseBlocked:
		phaseOutput = c.blocked()
	case PhaseCompleted:
		phaseOutput = c.completed()
	default:
		phaseOutput = c.idle()
	}

	result := phaseOutput.with("meta", meta, "behavioral", behavioral, "roadmap", roadmapFor(c.phase()))

	if gate := c.gate(); gate != nil {
		result.set("gate", gate)
	}

	if guide := c.protocolGuide(); guide != nil {
		result.set("protocolGuide", guide)
	}

	if directive, ok := phaseModeDirective(c.phase()); ok {
		result.set("modeDirective", directive)
	}

	if options := c.interactiveOptions(phaseOutput); len(options) > 0 {
		interactive := make([]any, len(options))
		commandMap := NewJSObject()

		for i, opt := range options {
			interactive[i] = JSObjectOf("label", opt.label, "description", opt.description)
			commandMap.set(opt.label, opt.command)
		}

		result.set("interactiveOptions", interactive)
		result.set("commandMap", commandMap)

		if in.Hints.OptionPresentation == "tool" {
			result.set("toolHint", "AskUserQuestion")
			result.set("toolHintInstruction", "Present these options with AskUserQuestion so the user's pick maps to `commandMap`.")
		} else {
			result.set("toolHint", "prose-numbered-list")
			result.set("toolHintInstruction", "Present options as a numbered list. Ask user to pick a number.")
		}
	}

	return result
}

func roadmapFor(phase string) string {
	type step struct{ key, label string }

	steps := []step{
		{PhaseIdle, "IDLE"}, {PhaseDiscovery, "DISCOVERY"}, {PhaseDiscoveryRefinement, "REFINEMENT"},
		{PhaseSpecProposal, "PROPOSAL"}, {PhaseSpecApproved, "APPROVED"}, {PhaseExecuting, "EXECUTING"},
		{PhaseCompleted, "COMPLETED"}, {"IDLE_END", "IDLE"},
	}

	parts := make([]string, len(steps))

	for i, s := range steps {
		switch {
		case phase == PhaseBlocked && s.key == PhaseExecuting:
			parts[i] = "[ EXECUTING (BLOCKED) ]"
		case phase != PhaseBlocked && s.key == phase:
			parts[i] = "[ " + s.label + " ]"
		default:
			parts[i] = s.label
		}
	}

	return strings.Join(parts, " → ")
}

func (c *compiler) meta() *JSObject {
	state := c.state()
	discovery := discoveryOf(state)
	execution := executionOf(state)
	answers := jsNumberString(float64(len(discovery.arr("answers"))))

	var resumeHint string

	switch c.phase() {
	case PhaseIdle:
		resumeHint = "No active spec. Start one with: `" + c.cmd(`spec new --name=<slug> "description"`) + "`"
	case PhaseDiscovery:
		resumeHint = `Discovery in progress for "` + jsDisplay(state.getOr("spec")) + `". ` + answers + " questions answered so far."
	case PhaseDiscoveryRefinement:
		resumeHint = "Discovery answers ready for review. " + answers + " answers collected. Waiting for user confirmation."
	case PhaseSpecProposal:
		resumeHint = "Spec draft ready for review at " + jsDisplay(state.objOrEmpty("specState").getOr("path")) + ". Waiting for approval."
	case PhaseSpecApproved:
		resumeHint = `Spec "` + jsDisplay(state.getOr("spec")) + `" is approved. Waiting to start execution.`
	case PhaseExecuting:
		iteration := jsDisplay(execution.getOr("iteration"))
		if execution.isNullish("lastProgress") {
			resumeHint = `Executing "` + jsDisplay(state.getOr("spec")) + `", iteration ` + iteration + ". Start the first task."
		} else {
			resumeHint = `Executing "` + jsDisplay(state.getOr("spec")) + `", iteration ` + iteration +
				". Last progress: " + jsDisplay(execution.getOr("lastProgress")) + ". Continue with the current task."
		}
	case PhaseBlocked:
		resumeHint = "Execution blocked: " + jsDisplay(execution.getOr("lastProgress")) + ". Ask the user to resolve."
	case PhaseCompleted:
		resumeHint = `Spec "` + jsDisplay(state.getOr("spec")) + `" completed in ` + jsDisplay(execution.getOr("iteration")) + " iterations."
	default:
		resumeHint = "Run `" + c.cs("next") + "` to get started."
	}

	meta := JSObjectOf("protocol", "Run `"+c.cs(`next --answer="..."`)+"` to submit results and advance")
	copyField(meta, state, "spec")
	copyField(meta, state, "branch")
	copyField(meta, execution, "iteration")
	copyField(meta, execution, "lastProgress")
	meta.set("activeConcerns", c.activeIDs())
	meta.set("resumeHint", resumeHint)
	meta.set("enforcement", enforcementOf(c.in.Hints))

	return meta
}

func (c *compiler) protocolGuide() *JSObject {
	return protocolGuide(c.state(), c.in.Now, c.cs)
}

func (c *compiler) gate() *JSObject {
	switch c.phase() {
	case PhaseDiscoveryRefinement:
		report := CheckSpecCompletenessObject(c.state().objOrEmpty("specState"))
		info := jsNumberString(float64(len(discoveryOf(c.state()).arr("answers")))) + "/6 answers collected."

		if !report.CanAdvance {
			titles := make([]string, len(report.Unresolved))
			for i, s := range report.Unresolved {
				titles[i] = s.Title
			}

			sections := make([]string, len(report.PendingDecisions))
			for i, d := range report.PendingDecisions {
				sections[i] = d.str("section")
			}

			return JSObjectOf(
				"message", info+" Spec incomplete: "+jsNumberString(float64(len(report.Unresolved)+len(report.PendingDecisions)))+
					" item(s) need resolution before advancing.",
				"action", "Resolve every placeholder + pending decision before approving. Do NOT advance until 100%. "+
					"Unresolved: "+listOrNone(titles)+". Pending: "+listOrNone(sections)+"."+c.sectionHint(len(report.Unresolved) > 0),
				"phase", PhaseDiscoveryRefinement,
			)
		}

		return JSObjectOf(
			"message", info+" All sections resolved.",
			"action", "Type APPROVE to generate spec, or REVISE to correct answers.",
			"phase", PhaseDiscoveryRefinement,
		)
	case PhaseSpecApproved:
		count := 0
		if c.in.Parsed != nil {
			count = len(c.in.Parsed.Tasks)
		}

		return JSObjectOf(
			"message", "Spec approved. "+jsNumberString(float64(count))+" tasks ready.",
			"action", "Type START to begin execution.",
			"phase", PhaseSpecApproved,
		)
	default:
		return nil
	}
}

// sectionHint is the gate's pointer to `spec <name> section`, when a
// section is open.
func (c *compiler) sectionHint(open bool) string {
	if !open {
		return ""
	}

	name := c.spec
	if !c.hasSpec {
		name = "<name>"
	}

	return " Ask the user about each unresolved section. " + sectionCommandsHint(c.in.CommandPrefix, name)
}

func listOrNone(items []string) string {
	if len(items) == 0 {
		return "none"
	}

	return strings.Join(items, ", ")
}

type option struct{ label, description, command string }

func (c *compiler) interactiveOptions(phaseOutput *JSObject) []option {
	switch c.phase() {
	case PhaseDiscovery:
		if detected := phaseOutput.obj("activePlanDetected"); detected != nil {
			return []option{
				{"Convert plan (" + detected.str("age") + ")", "Import " + detected.str("path") + " as STATED pre-fill for discovery",
					c.cs(`next --answer="import-plan"`)},
				{"Share my own context", "Start fresh — tell me what you want to build", c.cs(`next --answer="<your context here>"`)},
			}
		}

		return nil
	case PhaseIdle:
		var opts []option

		if len(c.in.ActiveConcerns) == 0 {
			opts = append(opts, option{"Add concerns (Recommended)",
				"Shape how discovery and specs work by adding project concerns", c.cmd("concern add <id> [<id2> ...]")})
		}

		opts = append(opts, option{"Start a new spec",
			"Tell me what you want to build: a one-liner, detailed requirements, meeting notes, anything", c.cmd(`spec new "description"`)})

		if c.in.Idle != nil {
			continuable := 0

			for _, spec := range c.in.Idle.ExistingSpecs {
				if spec.str("phase") == PhaseCompleted || continuable == 2 {
					continue
				}

				continuable++

				description := "Iteration " + jsDisplay(spec.getOr("iteration"))
				if detail, ok := spec.strOK("detail"); ok {
					description = detail
				}

				opts = append(opts, option{"Continue: " + spec.str("name") + " (" + spec.str("phase") + ")", description,
					c.cmd("spec " + spec.str("name") + " next")})
			}
		}

		if len(c.in.ActiveConcerns) > 0 {
			ids := make([]string, len(c.in.ActiveConcerns))
			for i, concern := range c.in.ActiveConcerns {
				ids[i] = concern.ID
			}

			opts = append(opts, option{"Edit concerns", "Currently: " + strings.Join(ids, ", "), c.cmd("concern list")})
		}

		return opts[:min(4, len(opts))]
	case PhaseDiscoveryRefinement:
		if discoveryOf(c.state()).isTrue("approved") {
			return []option{
				{"Keep as one spec", "All work in a single spec", c.cs(`next --answer="keep"`)},
				{"Split into separate specs", "Create one spec per independent area", c.cs(`next --answer="split"`)},
			}
		}

		return []option{
			{"Approve all answers", "Answers look correct — generate the spec", c.cs(`next --answer="approve"`)},
			{"Revise answers", "Correct one or more discovery answers", c.cs(`next --answer='{"revise":{...}}'`)},
		}
	case PhaseSpecProposal:
		return []option{
			{"Approve spec", "Review looks good — approve and move to execution", c.cs("approve")},
			{"Refine spec", "Submit refinements to improve tasks or sections", c.cs(`next --answer='{"refinement":"..."}'`)},
			{"Save for later", "Keep the draft as-is. Others can review, add ACs, notes, or tasks. Come back anytime to approve.",
				c.cs(`next --answer="save"`)},
			{"Start over", "Reset the spec and start fresh", c.cs("reset")},
		}
	case PhaseSpecApproved:
		return []option{
			{"Start execution", "Begin implementing the tasks", c.cs(`next --answer="start"`)},
			{"Save for later", "Spec is approved but don't start execution yet. Others can still add ACs or notes.",
				c.cs(`next --answer="save"`)},
		}
	case PhaseBlocked:
		return []option{
			{"Resolve block", "Provide a resolution to unblock execution", c.cs(`next --answer="resolution"`)},
			{"Reset spec", "Abandon this spec and start over", c.cs("reset")},
		}
	case PhaseCompleted:
		return []option{
			{"New spec", "Start a new feature spec", c.cmd(`spec new --name=<slug> "description"`)},
			{"Reopen spec", "Reopen this spec for revision", c.cs("reopen")},
			{"Check status", "Review completed spec summary", c.cmd("status")},
		}
	default:
		return nil
	}
}

func (c *compiler) idle() *JSObject {
	var existing []any
	if c.in.Idle != nil {
		existing = anyOfObjects(c.in.Idle.ExistingSpecs)
	}

	if existing == nil {
		existing = []any{}
	}

	instruction := `No specs yet. Ask the user "What do you want to build?" and accept any input, then run ` +
		"`" + c.cmd(`spec new "their answer"`) + "` immediately. Do NOT list options or ask clarifying questions first."
	if len(existing) > 0 {
		instruction = "No active spec. If the user described what they want, run `" + c.cmd(`spec new "description"`) +
			"` immediately; the name is auto-generated. Present ALL available concerns (split across multiple calls if needed)."
	}

	defaults, _ := DefaultConcerns()
	available := make([]any, len(defaults))

	for i, concern := range defaults {
		available[i] = JSObjectOf("id", concern.ID, "description", concern.Description)
	}

	rulesCount := len(c.in.Rules)
	if c.in.Idle != nil {
		rulesCount = c.in.Idle.RulesCount
	}

	out := JSObjectOf(
		"phase", PhaseIdle,
		"instruction", instruction,
		"welcome", idleWelcome,
		"existingSpecs", existing,
		"availableConcerns", available,
		"activeConcerns", c.activeIDs(),
		"activeRulesCount", jsInteger(rulesCount),
		"behavioralNote", "These options are fallbacks. If the user already described what they want, act on it "+
			"directly without presenting these options.",
	)

	if len(c.in.ActiveConcerns) == 0 {
		out.set("hint", "No concerns active. Consider adding concerns first — they shape discovery questions and specs.")
	}

	return out
}
