// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"slices"
	"strings"
)

// =============================================================================
// Where concern content applies (mirrors state/concern-scope.ts)
// =============================================================================

// ConcernScopes lists every scope value, in the order the docs list them.
func ConcernScopes() []ConcernScope {
	return []ConcernScope{ConcernScopeUI, ConcernScopeAPI, ConcernScopeData, ConcernScopeMigration}
}

// IsConcernScope reports whether value is one of ConcernScopes.
func IsConcernScope(value string) bool {
	return slices.Contains(ConcernScopes(), value)
}

// scopeFlag reports the classification flag a scope value stands for. An
// unknown value has no flag and never matches.
func scopeFlag(value ConcernScope, cl *SpecClassification) bool {
	switch value {
	case ConcernScopeUI:
		return cl.InvolvesWebUI
	case ConcernScopeAPI:
		return cl.InvolvesPublicAPI
	case ConcernScopeData:
		return cl.InvolvesDataHandling
	case ConcernScopeMigration:
		return cl.InvolvesMigration
	default:
		return false
	}
}

// conditionFlag reports the classification flag a legacy section condition
// names. A name that is not a flag never matches.
func conditionFlag(condition string, cl *SpecClassification) bool {
	switch condition {
	case "involvesWebUI":
		return cl.InvolvesWebUI
	case "involvesCLI":
		return cl.InvolvesCLI
	case "involvesPublicAPI":
		return cl.InvolvesPublicAPI
	case "involvesMigration":
		return cl.InvolvesMigration
	case "involvesDataHandling":
		return cl.InvolvesDataHandling
	default:
		return false
	}
}

// uiFileExtensions are the files the hook adds "ui" reminders for.
func uiFileExtensions() []string {
	return []string{".tsx", ".jsx", ".html", ".css", ".svelte", ".vue"}
}

// sourceFileExtensions are the source files the hook adds "api" reminders for.
func sourceFileExtensions() []string {
	return []string{".ts", ".go", ".py", ".rs"}
}

// scopeCoversFile reports whether a scope value's reminders are added for a
// file with this extension. "data" and "migration" have no file type of
// their own, so they cover every file.
func scopeCoversFile(value ConcernScope, extension string) bool {
	switch value {
	case ConcernScopeUI:
		return slices.Contains(uiFileExtensions(), extension)
	case ConcernScopeAPI:
		return slices.Contains(sourceFileExtensions(), extension)
	case ConcernScopeData, ConcernScopeMigration:
		return true
	default:
		return false
	}
}

// fileExtension returns the extension of a path's last segment, with its
// dot, or "".
func fileExtension(filePath string) string {
	nameStart := max(strings.LastIndex(filePath, "/"), strings.LastIndex(filePath, `\`)) + 1
	dot := strings.LastIndex(filePath, ".")

	if dot > nameStart {
		return filePath[dot:]
	}

	return ""
}

// ScopeMatchesClassification reports whether content with this scope
// applies to a spec with this classification: an empty scope applies to
// every spec, otherwise one of its values must have its flag set.
func ScopeMatchesClassification(scope []ConcernScope, cl *SpecClassification) bool {
	if len(scope) == 0 {
		return true
	}

	for _, value := range scope {
		if scopeFlag(value, cl) {
			return true
		}
	}

	return false
}

// ScopeMatchesFile reports whether a reminder with this scope applies to an
// edit of filePath: one scope value must cover the file and have its flag
// set in the classification. A nil classification (not known yet) matches
// every value. An empty scope matches nothing, because a reminder without a
// scope is in the compiled instruction instead.
func ScopeMatchesFile(scope []ConcernScope, filePath string, cl *SpecClassification) bool {
	extension := fileExtension(filePath)

	for _, value := range scope {
		if scopeCoversFile(value, extension) && (cl == nil || scopeFlag(value, cl)) {
			return true
		}
	}

	return false
}

// sectionMatchesClassification reports whether a section applies to a spec
// with this classification: its scope must match, and so must its legacy
// condition when it has one.
func sectionMatchesClassification(scope []ConcernScope, condition *string, cl *SpecClassification) bool {
	if !ScopeMatchesClassification(scope, cl) {
		return false
	}

	return condition == nil || conditionFlag(*condition, cl)
}

// scopeValueProblem returns why a declared scope is invalid, or "".
func scopeValueProblem(where string, scope []ConcernScope) string {
	for _, value := range scope {
		if !IsConcernScope(value) {
			return fmt.Sprintf(
				"%s.scope has %q; expected a list of %s",
				where,
				value,
				strings.Join(ConcernScopes(), ", "),
			)
		}
	}

	return ""
}

// sectionScope reads the scope of a specSections entry, which is decoded as
// map[string]any or given as a SpecSectionDefinition. ok is false when the
// scope is present but not a list of strings.
func sectionScope(raw any) (scope []ConcernScope, ok bool) {
	switch section := raw.(type) {
	case SpecSectionDefinition:
		return section.Scope, true
	case map[string]any:
		value, present := section["scope"]
		if !present || value == nil {
			return nil, true
		}

		list, isList := value.([]any)
		if !isList {
			return nil, false
		}

		scope = make([]ConcernScope, 0, len(list))

		for _, item := range list {
			text, isText := item.(string)
			if !isText {
				return nil, false
			}

			scope = append(scope, text)
		}

		return scope, true
	default:
		return nil, true
	}
}

// ValidateConcernScopes checks the scope values a concern declares on its
// reminders and spec sections. It returns an error wrapping ErrInvalidScope
// that names the first invalid entry, or nil when every value is valid.
// Concern files are user input, so LoadConcerns calls it before the content
// is used.
func ValidateConcernScopes(concern *ConcernDefinition) error {
	for i, reminder := range concern.Reminders {
		if problem := scopeValueProblem(fmt.Sprintf("reminders[%d]", i), reminder.Scope); problem != "" {
			return fmt.Errorf("%w: %s", ErrInvalidScope, problem)
		}
	}

	for i, raw := range concern.SpecSections {
		where := fmt.Sprintf("specSections[%d]", i)

		scope, ok := sectionScope(raw)
		if !ok {
			return fmt.Errorf(
				"%w: %s.scope is not a list; expected a list of %s",
				ErrInvalidScope,
				where,
				strings.Join(ConcernScopes(), ", "),
			)
		}

		if problem := scopeValueProblem(where, scope); problem != "" {
			return fmt.Errorf("%w: %s", ErrInvalidScope, problem)
		}
	}

	return nil
}
