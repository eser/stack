// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// ErrRegistryNotFound is returned when no registry manifest can be located.
var ErrRegistryNotFound = errors.New("registry manifest not found")

// FilterOptions holds optional filter criteria for FilterRecipes.
type FilterOptions struct {
	Language string
	Scale    string
	Tag      string
}

// FilterRecipes returns the subset of recipes that match all non-empty fields in opts.
// Language and Scale use exact string equality; Tag uses slice-contains exact match.
func FilterRecipes(recipes []Recipe, opts FilterOptions) []Recipe {
	if opts.Language == "" && opts.Scale == "" && opts.Tag == "" {
		return recipes
	}

	out := make([]Recipe, 0, len(recipes))

	for _, r := range recipes {
		if opts.Language != "" && r.Language != opts.Language {
			continue
		}

		if opts.Scale != "" && string(r.Scale) != opts.Scale {
			continue
		}

		if opts.Tag != "" {
			found := false

			for _, tag := range r.Tags {
				if tag == opts.Tag {
					found = true
					break
				}
			}

			if !found {
				continue
			}
		}

		out = append(out, r)
	}

	return out
}

// ErrRecipeNotFound is returned when the named recipe is absent from a manifest.
var ErrRecipeNotFound = errors.New("recipe not found in registry")

// localRegistryFile is the path under any ancestor directory that holds the manifest.
const localRegistryFile = ".eser/recipes.json"

// maxAncestorSearch is how many parent directories to search for a local manifest.
const maxAncestorSearch = 10

// ResolveSpecifier parses a kit specifier string.
//
// Formats:
//   - "gh:owner/repo#ref"   → Kind=="repo", Owner, Repo, Ref set
//   - "gh:owner/repo"       → Kind=="repo", Ref empty
//   - "recipeName"          → Kind=="name", Name set
func ResolveSpecifier(specifier string) ResolvedSpecifier {
	if strings.HasPrefix(specifier, "gh:") {
		rest := strings.TrimPrefix(specifier, "gh:")
		ref := ""

		if idx := strings.LastIndex(rest, "#"); idx >= 0 {
			ref = rest[idx+1:]
			rest = rest[:idx]
		}

		parts := strings.SplitN(rest, "/", 2)
		if len(parts) == 2 {
			return ResolvedSpecifier{
				Kind:  "repo",
				Owner: parts[0],
				Repo:  parts[1],
				Ref:   ref,
			}
		}
	}

	return ResolvedSpecifier{Kind: "name", Name: specifier}
}

// FetchRegistry loads a RegistryManifest.
//
// If registryURL starts with "http" it is fetched via HTTP.
// Otherwise it is treated as a file path.
// If registryURL is empty, the function walks up to maxAncestorSearch
// parent directories from cwd to find a .eser/recipes.json file.
func FetchRegistry(cwd, registryURL string) (*RegistryManifest, error) {
	if registryURL != "" {
		if strings.HasPrefix(registryURL, "http") {
			return fetchRegistryHTTP(registryURL)
		}

		return fetchRegistryFile(registryURL)
	}

	// Walk up to find a local manifest.
	dir := cwd

	for range maxAncestorSearch {
		candidate := filepath.Join(dir, localRegistryFile)
		if _, err := os.Stat(candidate); err == nil {
			return fetchRegistryFile(candidate)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}

		dir = parent
	}

	return nil, ErrRegistryNotFound
}

// FetchRegistryFromRepo fetches a registry manifest from a GitHub repository.
// It uses the GitHub Contents API at the well-known path "eser-registry.json".
func FetchRegistryFromRepo(owner, repo, ref string) (*RegistryManifest, error) {
	path := "eser-registry.json"
	content, err := fetchGitHubFile(owner, repo, path, ref)

	if err != nil {
		return nil, fmt.Errorf("fetching registry from github.com/%s/%s: %w", owner, repo, err)
	}

	var manifest RegistryManifest
	if err := json.Unmarshal([]byte(content), &manifest); err != nil {
		return nil, fmt.Errorf("parsing registry manifest: %w", err)
	}

	return &manifest, nil
}

// FetchRecipeFile fetches the content of a single recipe file.
func FetchRecipeFile(file *RecipeFile, recipe *Recipe, registryURL string) (string, error) {
	switch file.Provider {
	case RecipeFileProviderGitHub:
		spec := ResolveSpecifier(registryURL)
		if spec.Kind != "repo" {
			return "", fmt.Errorf("github provider requires a gh: registry URL, got %q", registryURL)
		}

		return fetchGitHubFile(spec.Owner, spec.Repo, file.Source, spec.Ref)

	default:
		// Local provider: source is relative to the registry manifest location.
		return readLocalFile(file.Source)
	}
}

// FetchRecipeFolder fetches all files within a recipe folder entry.
// Returns a slice of FetchedFile so callers can write them atomically after
// all downloads succeed (matching the TS atomicity guarantee).
func FetchRecipeFolder(file *RecipeFile, recipe *Recipe, registryURL string) ([]FetchedFile, error) {
	switch file.Provider {
	case RecipeFileProviderGitHub:
		spec := ResolveSpecifier(registryURL)
		if spec.Kind != "repo" {
			return nil, fmt.Errorf("github provider requires a gh: registry URL, got %q", registryURL)
		}

		return fetchGitHubFolder(spec.Owner, spec.Repo, file.Source, spec.Ref)

	default:
		return readLocalFolder(file.Source)
	}
}

// --- internal helpers ---

func fetchRegistryFile(path string) (*RegistryManifest, error) {
	data, err := os.ReadFile(path) //nolint:gosec // path comes from trusted config lookup
	if err != nil {
		return nil, fmt.Errorf("reading registry file %q: %w", path, err)
	}

	var manifest RegistryManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("parsing registry file %q: %w", path, err)
	}

	return &manifest, nil
}

func fetchRegistryHTTP(url string) (*RegistryManifest, error) {
	resp, err := http.Get(url) //nolint:gosec,noctx // registry URL is user-supplied config
	if err != nil {
		return nil, fmt.Errorf("fetching registry %q: %w", url, err)
	}

	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetching registry %q: HTTP %d", url, resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("reading registry response: %w", err)
	}

	var manifest RegistryManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("parsing registry response: %w", err)
	}

	return &manifest, nil
}

// githubContentsItem is a single entry from the GitHub Contents API response.
type githubContentsItem struct {
	Type        string `json:"type"` // "file" or "dir"
	Name        string `json:"name"`
	Path        string `json:"path"`
	Content     string `json:"content"` // base64-encoded, present for files
	Encoding    string `json:"encoding"`
	DownloadURL string `json:"download_url"`
}

func fetchGitHubFile(owner, repo, path, ref string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, path)
	if ref != "" {
		url += "?ref=" + ref
	}

	req, err := http.NewRequest(http.MethodGet, url, http.NoBody) //nolint:noctx
	if err != nil {
		return "", err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("GitHub API GET %s: %w", url, err)
	}

	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API GET %s: HTTP %d", url, resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	var item githubContentsItem
	if err := json.Unmarshal(data, &item); err != nil {
		return "", fmt.Errorf("parsing GitHub contents response: %w", err)
	}

	if item.Encoding == "base64" {
		decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(item.Content, "\n", ""))
		if err != nil {
			return "", fmt.Errorf("decoding base64 content from GitHub: %w", err)
		}

		return string(decoded), nil
	}

	return item.Content, nil
}

func fetchGitHubFolder(owner, repo, path, ref string) ([]FetchedFile, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, path)
	if ref != "" {
		url += "?ref=" + ref
	}

	req, err := http.NewRequest(http.MethodGet, url, http.NoBody) //nolint:noctx
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GitHub folder listing %s: %w", url, err)
	}

	defer resp.Body.Close() //nolint:errcheck

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub folder listing %s: HTTP %d", url, resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var items []githubContentsItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, fmt.Errorf("parsing GitHub folder listing: %w", err)
	}

	var files []FetchedFile

	for _, item := range items {
		if item.Type != "file" {
			continue // skip subdirs for now
		}

		content, err := fetchGitHubFile(owner, repo, item.Path, ref)
		if err != nil {
			return nil, fmt.Errorf("fetching %s: %w", item.Path, err)
		}

		// Strip the folder prefix so paths are relative to the recipe target.
		relPath := strings.TrimPrefix(item.Path, path)
		relPath = strings.TrimPrefix(relPath, "/")

		files = append(files, FetchedFile{Path: relPath, Content: content})
	}

	return files, nil
}

func readLocalFile(path string) (string, error) {
	data, err := os.ReadFile(path) //nolint:gosec
	if err != nil {
		return "", fmt.Errorf("reading local file %q: %w", path, err)
	}

	return string(data), nil
}

func readLocalFolder(dir string) ([]FetchedFile, error) {
	var files []FetchedFile

	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() {
			return nil
		}

		data, err := os.ReadFile(path) //nolint:gosec
		if err != nil {
			return err
		}

		relPath, _ := filepath.Rel(dir, path)
		files = append(files, FetchedFile{Path: relPath, Content: string(data)})

		return nil
	})

	return files, err
}
