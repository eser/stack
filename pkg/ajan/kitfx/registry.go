// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// The default registry: .eser/recipes.json on the main branch of eser/stack.
const (
	DefaultRegistryOwner = "eser"
	DefaultRegistryRepo  = "stack"
	// DefaultRef is the git ref of a repository specifier without "#ref".
	DefaultRef = "main"
)

// DefaultRegistryURL returns the URL of the default registry manifest on the
// raw host of github.
func DefaultRegistryURL(github GitHubEndpoints) string {
	return fmt.Sprintf("%s/%s/%s/%s/%s", github.withDefaults().Raw, DefaultRegistryOwner, DefaultRegistryRepo, DefaultRef, localRegistryFile)
}

// LoadRegistryOptions configures LoadRegistry.
type LoadRegistryOptions struct {
	// Source is the path or http(s) URL of the manifest. Empty selects the
	// nearest local manifest when Local is set, then the default registry.
	Source string
	// Local looks for .eser/recipes.json in CWD and up to nine parents first.
	Local bool
	// CWD is where the local search starts and what a relative Source is
	// read against.
	CWD string
	// Verbose prints which registry is loaded on Stdout.
	Verbose bool
	Stdout  io.Writer
	// Stderr receives the warning for an unknown $schema.
	Stderr     io.Writer
	HTTPClient *http.Client
	GitHub     GitHubEndpoints
}

// RegistryLoadError is a registry manifest that could not be loaded.
type RegistryLoadError struct {
	// Source is the path or URL the manifest was loaded from.
	Source string
	// Step is the step that failed, or what is wrong with the manifest.
	Step string
	Err  error
}

func (e *RegistryLoadError) Error() string {
	if e.Err == nil {
		return fmt.Sprintf("load registry %s: %s", e.Source, e.Step)
	}

	return fmt.Sprintf("load registry %s: %s: %v", e.Source, e.Step, e.Err)
}

func (e *RegistryLoadError) Unwrap() error { return e.Err }

// LoadRegistry loads and validates a registry manifest the way the TypeScript
// kit does: Source when given, else the nearest local manifest when Local is
// set, else the default registry. It returns the manifest and where it came
// from.
func LoadRegistry(ctx context.Context, opts *LoadRegistryOptions) (*RegistryManifest, string, error) {
	stdout := writerOrDiscard(opts.Stdout)
	source := opts.Source

	if source == "" {
		source = DefaultRegistryURL(opts.GitHub)

		if opts.Local {
			if found := findLocalRegistry(opts.CWD); found != "" {
				source = found

				if opts.Verbose {
					_, _ = fmt.Fprintf(stdout, "Using local registry: %s\n", found)
				}
			}
		}
	}

	if opts.Verbose {
		_, _ = fmt.Fprintf(stdout, "Fetching registry from: %s\n", source)
	}

	var data []byte

	if isHTTPURL(source) {
		body, err := newFetcher(opts.HTTPClient, opts.GitHub).get(ctx, source, "", maxRegistryResponseBytes)
		if err != nil {
			return nil, source, &RegistryLoadError{Source: source, Step: "download the manifest", Err: err}
		}

		data = body
	} else {
		path := source
		if !filepath.IsAbs(path) && opts.CWD != "" {
			path = filepath.Join(opts.CWD, path)
		}

		body, err := os.ReadFile(path) //nolint:gosec // G304: the registry the caller chose
		if errors.Is(err, os.ErrNotExist) {
			return nil, source, &RegistryLoadError{
				Source: source,
				Step:   "the file does not exist; pass --registry with the path or URL of a recipes.json",
				Err:    err,
			}
		}

		if err != nil {
			return nil, source, &RegistryLoadError{Source: source, Step: "read the file", Err: err}
		}

		data = body
	}

	manifest, err := ParseRegistryManifest(data, opts.Stderr)
	if err != nil {
		return nil, source, &RegistryLoadError{Source: source, Step: "the manifest does not match the registry/v1 schema", Err: err}
	}

	return manifest, source, nil
}

// findLocalRegistry returns the nearest .eser/recipes.json in dir or one of
// its parents, ten levels at most, or "".
func findLocalRegistry(dir string) string {
	if dir == "" {
		return ""
	}

	for range maxAncestorSearch {
		candidate := filepath.Join(dir, localRegistryFile)
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}

		dir = parent
	}

	return ""
}

// ErrInvalidManifest is wrapped by every ParseRegistryManifest failure.
var ErrInvalidManifest = errors.New("invalid registry manifest")

var (
	validFileKinds     = map[RecipeFileKind]bool{RecipeFileKindFile: true, RecipeFileKindFolder: true}
	validFileProviders = map[RecipeFileProvider]bool{RecipeFileProviderLocal: true, RecipeFileProviderGitHub: true}
)

// ParseRegistryManifest decodes and validates a registry/v1 manifest with the
// TypeScript kit's rules: name, description, author, registryUrl and recipes
// present; every recipe with a name, description, language, valid scale and
// at least one file; valid file kinds and providers; unique names. A $schema
// that does not name registry/v1 loads with a warning on warn (nil discards).
func ParseRegistryManifest(data []byte, warn io.Writer) (*RegistryManifest, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, fmt.Errorf("%w: the manifest is not a JSON object: %w", ErrInvalidManifest, err)
	}

	for _, key := range []string{"name", "description", "author", "registryUrl", "recipes"} {
		if _, ok := fields[key]; !ok {
			return nil, fmt.Errorf("%w: it requires a %q field", ErrInvalidManifest, key)
		}
	}

	var manifest RegistryManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrInvalidManifest, err)
	}

	if manifest.Schema != "" && !strings.Contains(manifest.Schema, "registry/v1") {
		_, _ = fmt.Fprintf(writerOrDiscard(warn), "Warning: Registry uses unknown schema %q. This CLI supports v1.\n", manifest.Schema)
	}

	if manifest.Name == "" {
		return nil, fmt.Errorf("%w: it requires a non-empty 'name' field", ErrInvalidManifest)
	}

	if manifest.RegistryURL == "" {
		return nil, fmt.Errorf("%w: it requires a non-empty 'registryUrl' field", ErrInvalidManifest)
	}

	names := make(map[string]bool, len(manifest.Recipes))

	for i := range manifest.Recipes {
		recipe := &manifest.Recipes[i]

		if err := ValidateRecipe(recipe); err != nil {
			return nil, fmt.Errorf("%w: recipe %q: %w", ErrInvalidManifest, recipe.Name, err)
		}

		if err := validateRecipeFiles(recipe); err != nil {
			return nil, fmt.Errorf("%w: recipe %q: %w", ErrInvalidManifest, recipe.Name, err)
		}

		if names[recipe.Name] {
			return nil, fmt.Errorf("%w: %w: %q", ErrInvalidManifest, ErrDuplicateRecipeName, recipe.Name)
		}

		names[recipe.Name] = true
	}

	return &manifest, nil
}

func validateRecipeFiles(recipe *Recipe) error {
	for i, file := range recipe.Files {
		if file.Kind != "" && !validFileKinds[file.Kind] {
			return fmt.Errorf("files[%d]: kind %q is not \"file\" or \"folder\"", i, file.Kind)
		}

		if file.Provider != "" && !validFileProviders[file.Provider] {
			return fmt.Errorf("files[%d]: provider %q is not \"local\" or \"github\"", i, file.Provider)
		}
	}

	for i, variable := range recipe.Variables {
		if variable.Name == "" {
			return fmt.Errorf("variables[%d]: the name is empty", i)
		}
	}

	return nil
}

// ErrRecipeFileNotFound is returned by FetchRecipeFromRepo when the recipe
// file is not in the repository (HTTP 404); `kit clone` then copies the whole
// repository.
var ErrRecipeFileNotFound = errors.New("no recipe file at this path (HTTP 404)")

// RepoRecipeOptions configures FetchRecipeFromRepo.
type RepoRecipeOptions struct {
	// RecipePath is the recipe file in the repository or subpath;
	// "recipe.json" when empty.
	RecipePath string
	HTTPClient *http.Client
	GitHub     GitHubEndpoints
}

// FetchRecipeFromRepo reads a standalone recipe.json from the repository that
// spec names (Kind "repo"), under its Subpath, at its Ref (DefaultRef when
// empty). A missing file returns an error wrapping ErrRecipeFileNotFound. The
// recipe is validated leniently: every field may be absent.
func FetchRecipeFromRepo(ctx context.Context, spec *ResolvedSpecifier, opts RepoRecipeOptions) (*Recipe, error) {
	recipePath := opts.RecipePath
	if recipePath == "" {
		recipePath = "recipe.json"
	}

	ref := spec.Ref
	if ref == "" {
		ref = DefaultRef
	}

	effective := recipePath
	if spec.Subpath != "" {
		effective = spec.Subpath + "/" + recipePath
	}

	f := newFetcher(opts.HTTPClient, opts.GitHub)
	where := fmt.Sprintf("%s/%s@%s/%s", spec.Owner, spec.Repo, ref, effective)
	target := fmt.Sprintf("%s/%s/%s/%s/%s", f.github.Raw, spec.Owner, spec.Repo, ref, effective)

	data, err := f.get(ctx, target, "", maxRegistryResponseBytes)
	if err != nil {
		if requestErr, ok := errors.AsType[*RequestError](err); ok && requestErr.Status == http.StatusNotFound {
			return nil, fmt.Errorf("load recipe %s: %w", where, ErrRecipeFileNotFound)
		}

		return nil, fmt.Errorf("load recipe %s: download it; check that the repository exists: https://github.com/%s/%s: %w",
			where, spec.Owner, spec.Repo, err)
	}

	var recipe Recipe
	if err := json.Unmarshal(data, &recipe); err != nil {
		return nil, fmt.Errorf("load recipe %s: the file is not a valid recipe: %w", where, err)
	}

	if recipe.Scale != "" && !validScales[recipe.Scale] {
		return nil, fmt.Errorf("load recipe %s: the file is not a valid recipe: %w: got %q", where, ErrRecipeScaleInvalid, recipe.Scale)
	}

	if err := validateRecipeFiles(&recipe); err != nil {
		return nil, fmt.Errorf("load recipe %s: the file is not a valid recipe: %w", where, err)
	}

	return &recipe, nil
}

func writerOrDiscard(w io.Writer) io.Writer {
	if w == nil {
		return io.Discard
	}

	return w
}
