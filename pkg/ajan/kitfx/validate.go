// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"errors"
	"fmt"
)

// Sentinel validation errors.
var (
	ErrManifestNameRequired     = errors.New("manifest name is required")
	ErrDuplicateRecipeName      = errors.New("duplicate recipe name")
	ErrRecipeNameRequired       = errors.New("recipe name is required")
	ErrRecipeDescRequired       = errors.New("recipe description is required")
	ErrRecipeLanguageRequired   = errors.New("recipe language is required")
	ErrRecipeScaleRequired      = errors.New("recipe scale is required")
	ErrRecipeScaleInvalid       = errors.New("recipe scale must be 'project', 'structure', or 'utility'")
	ErrRecipeFilesRequired      = errors.New("recipe must have at least one file")
	ErrRecipeFileSourceRequired = errors.New("recipe file source is required")
	ErrRecipeFileTargetRequired = errors.New("recipe file target is required")
)

var validScales = map[RecipeScale]bool{
	RecipeScaleProject:   true,
	RecipeScaleStructure: true,
	RecipeScaleUtility:   true,
}

// ValidateRegistryManifest checks a RegistryManifest for structural correctness.
// It validates the manifest header and each recipe, then checks for name uniqueness.
func ValidateRegistryManifest(m *RegistryManifest) error {
	if m.Name == "" {
		return ErrManifestNameRequired
	}

	seen := make(map[string]bool, len(m.Recipes))

	for i := range m.Recipes {
		if err := ValidateRecipe(&m.Recipes[i]); err != nil {
			return fmt.Errorf("recipe[%d] %q: %w", i, m.Recipes[i].Name, err)
		}

		if seen[m.Recipes[i].Name] {
			return fmt.Errorf("%w: %q", ErrDuplicateRecipeName, m.Recipes[i].Name)
		}

		seen[m.Recipes[i].Name] = true
	}

	return nil
}

// ValidateRecipe checks a single Recipe for required fields.
func ValidateRecipe(r *Recipe) error {
	if r.Name == "" {
		return ErrRecipeNameRequired
	}

	if r.Description == "" {
		return ErrRecipeDescRequired
	}

	if r.Language == "" {
		return ErrRecipeLanguageRequired
	}

	if r.Scale == "" {
		return ErrRecipeScaleRequired
	}

	if !validScales[r.Scale] {
		return fmt.Errorf("%w: got %q", ErrRecipeScaleInvalid, r.Scale)
	}

	if len(r.Files) == 0 {
		return ErrRecipeFilesRequired
	}

	for i, f := range r.Files {
		if f.Source == "" {
			return fmt.Errorf("files[%d]: %w", i, ErrRecipeFileSourceRequired)
		}

		if f.Target == "" {
			return fmt.Errorf("files[%d]: %w", i, ErrRecipeFileTargetRequired)
		}
	}

	return nil
}
