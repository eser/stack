// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"errors"
	"fmt"
)

// ErrCyclicDependency is returned when a circular dependency is detected.
var ErrCyclicDependency = errors.New("cyclic dependency detected")

// ErrMissingDependency is returned when a required recipe is not found.
var ErrMissingDependency = errors.New("missing dependency")

// ResolveRequires performs a DFS topological sort on the recipe dependency graph.
//
// Returns recipes in application order (dependencies before dependents).
// Diamond dependencies are handled by the resolvedNames set — D is appended only
// once even if both B and C depend on D.
//
// Cycle detection uses the visiting set (gray nodes). If we revisit a gray node,
// there is a cycle and ErrCyclicDependency is returned.
func ResolveRequires(recipeName string, recipes []Recipe) ([]Recipe, error) {
	index := make(map[string]*Recipe, len(recipes))
	for i := range recipes {
		index[recipes[i].Name] = &recipes[i]
	}

	resolved := make([]Recipe, 0, len(recipes))
	resolvedNames := make(map[string]bool)
	visiting := make(map[string]bool)

	if err := dfsResolve(recipeName, index, &resolved, resolvedNames, visiting); err != nil {
		return nil, err
	}

	return resolved, nil
}

// dfsResolve recursively resolves a single recipe and its transitive dependencies.
func dfsResolve(
	name string,
	index map[string]*Recipe,
	resolved *[]Recipe,
	resolvedNames map[string]bool,
	visiting map[string]bool,
) error {
	// Already resolved — diamond deduplication.
	if resolvedNames[name] {
		return nil
	}

	// In the current DFS path — cycle detected.
	if visiting[name] {
		return fmt.Errorf("%w: %q is part of a dependency cycle", ErrCyclicDependency, name)
	}

	recipe, ok := index[name]
	if !ok {
		return fmt.Errorf("%w: recipe %q not found", ErrMissingDependency, name)
	}

	visiting[name] = true

	for _, dep := range recipe.Requires {
		if err := dfsResolve(dep, index, resolved, resolvedNames, visiting); err != nil {
			return err
		}
	}

	delete(visiting, name)
	resolvedNames[name] = true
	*resolved = append(*resolved, *recipe)

	return nil
}
