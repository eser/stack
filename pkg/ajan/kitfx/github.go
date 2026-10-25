// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
)

// The public GitHub hosts that GitHubEndpoints falls back to.
const (
	DefaultGitHubRaw      = "https://raw.githubusercontent.com"
	DefaultGitHubAPI      = "https://api.github.com"
	DefaultGitHubCodeload = "https://codeload.github.com"
)

const (
	// tarballHTTPTimeout bounds a whole-repo tarball download, body included.
	tarballHTTPTimeout = 120 * time.Second

	// maxRecipeFileBytes caps one recipe file download. Recipe files are
	// source templates; the cap only stops a runaway response.
	maxRecipeFileBytes = 64 << 20
)

// GitHubEndpoints are the base URLs of the GitHub hosts kit reads from. A zero
// field selects the public host; tests point them at an httptest server.
type GitHubEndpoints struct {
	// Raw serves repository files: Raw/owner/repo/ref/path.
	Raw string
	// API serves folder listings: API/repos/owner/repo/contents/path?ref=ref.
	API string
	// Codeload serves repository tarballs: Codeload/owner/repo/tar.gz/ref.
	Codeload string
}

func (g GitHubEndpoints) withDefaults() GitHubEndpoints {
	trim := func(value, fallback string) string {
		if value == "" {
			return fallback
		}

		return strings.TrimRight(value, "/")
	}

	return GitHubEndpoints{
		Raw:      trim(g.Raw, DefaultGitHubRaw),
		API:      trim(g.API, DefaultGitHubAPI),
		Codeload: trim(g.Codeload, DefaultGitHubCodeload),
	}
}

// RequestError is a request to a registry host that got no response (Err is
// the network error) or a status outside 200-299.
type RequestError struct {
	URL string
	// Status is the HTTP status, or 0 when no response arrived.
	Status int
	Err    error
}

func (e *RequestError) Error() string {
	switch {
	case e.Status == 0:
		return fmt.Sprintf("GET %s: no response; check the network connection and the URL: %v", e.URL, e.Err)
	case e.Status == http.StatusNotFound:
		return fmt.Sprintf("GET %s: HTTP 404; check that the path exists at this ref", e.URL)
	case e.Status == http.StatusForbidden || e.Status == http.StatusTooManyRequests:
		return fmt.Sprintf("GET %s: HTTP %d; the host refused or rate-limited the request, so retry later", e.URL, e.Status)
	case e.Status >= http.StatusInternalServerError:
		return fmt.Sprintf("GET %s: HTTP %d; the host had an error, so retry later", e.URL, e.Status)
	default:
		return fmt.Sprintf("GET %s: HTTP %d", e.URL, e.Status)
	}
}

func (e *RequestError) Unwrap() error { return e.Err }

// fetcher sends kit's HTTP requests: every one bounded by a timeout and a
// body limit, against the configured GitHub hosts.
type fetcher struct {
	client *http.Client
	github GitHubEndpoints
}

func newFetcher(client *http.Client, github GitHubEndpoints) fetcher {
	if client == nil {
		client = &http.Client{} //nolint:exhaustruct // each request carries its own timeout
	}

	return fetcher{client: client, github: github.withDefaults()}
}

// open sends a GET request and returns the body of a 2xx response; the
// caller closes it and then calls the returned cancel.
func (f fetcher) open(ctx context.Context, target, accept string, timeout time.Duration) (io.ReadCloser, context.CancelFunc, error) {
	reqCtx, cancel := context.WithTimeout(ctx, timeout)

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, target, http.NoBody)
	if err != nil {
		cancel()

		return nil, nil, fmt.Errorf("build request for %q: %w", target, err)
	}

	if accept != "" {
		req.Header.Set("Accept", accept)
	}

	resp, err := f.client.Do(req)
	if err != nil {
		cancel()

		return nil, nil, &RequestError{URL: target, Status: 0, Err: err}
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		// The body is not read; closing it releases the connection.
		_ = resp.Body.Close()

		cancel()

		return nil, nil, &RequestError{URL: target, Status: resp.StatusCode, Err: nil}
	}

	return resp.Body, cancel, nil
}

// get returns the whole body of a 2xx response to a GET request, at most
// limit bytes.
func (f fetcher) get(ctx context.Context, target, accept string, limit int64) ([]byte, error) {
	body, cancel, err := f.open(ctx, target, accept, registryHTTPTimeout)
	if err != nil {
		return nil, err
	}
	defer cancel()

	// The body is read in full or abandoned on error; a failed close loses nothing.
	defer func() { _ = body.Close() }()

	data, err := lib.ReadAllLimited(body, limit)
	if err != nil {
		return nil, fmt.Errorf("read the response of GET %s: %w", target, err)
	}

	return data, nil
}

// rawGitHubLocation is a raw.githubusercontent.com URL split into its parts.
type rawGitHubLocation struct {
	owner, repo, ref, basePath string
}

// parseRawGitHubURL splits Raw/owner/repo/ref[/path]; ok is false for any
// other URL.
func (f fetcher) parseRawGitHubURL(target string) (rawGitHubLocation, bool) {
	rest, found := strings.CutPrefix(target, f.github.Raw+"/")
	if !found {
		return rawGitHubLocation{}, false //nolint:exhaustruct
	}

	parts := strings.SplitN(rest, "/", 4) //nolint:mnd // owner, repo, ref and the rest
	if len(parts) < 3 || parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return rawGitHubLocation{}, false //nolint:exhaustruct
	}

	location := rawGitHubLocation{owner: parts[0], repo: parts[1], ref: parts[2], basePath: ""}
	if len(parts) == 4 { //nolint:mnd
		location.basePath = parts[3]
	}

	return location, true
}

// joinRegistryURL joins a base and a relative path with one slash between
// them, as the TypeScript kit's resolveRegistryUrl does.
func joinRegistryURL(base, path string) string {
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(path, "/")
}

func isHTTPURL(value string) bool {
	return strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://")
}

// localPath turns a file:// URL or a plain path into a file system path.
func localPath(value string) (string, error) {
	if !strings.HasPrefix(value, "file://") {
		return filepath.FromSlash(value), nil
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return "", fmt.Errorf("parse file URL %q: %w", value, err)
	}

	return filepath.FromSlash(parsed.Path), nil
}

// fetchSource returns the content of the file at base/source.
func (f fetcher) fetchSource(ctx context.Context, base, source string) ([]byte, error) {
	target := joinRegistryURL(base, source)

	if isHTTPURL(target) {
		return f.get(ctx, target, "", maxRecipeFileBytes)
	}

	path, err := localPath(target)
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path) //nolint:gosec // G304: a source of the registry the caller chose
	if err != nil {
		return nil, fmt.Errorf("read %q: %w", path, err)
	}

	return data, nil
}

// githubFolderEntry is one entry of a GitHub contents API folder listing.
type githubFolderEntry struct {
	Type        string  `json:"type"`
	Path        string  `json:"path"`
	DownloadURL *string `json:"download_url"` //nolint:tagliatelle // the GitHub API's field name
}

// ErrNotAFolder is returned when a folder entry's source is a file.
var ErrNotAFolder = errors.New(`the path is a file, not a folder; use kind "file" for it in the registry`)

// ErrFolderNeedsGitHub is returned for a folder entry under an http base that
// is not a raw GitHub URL, which cannot be listed.
var ErrFolderNeedsGitHub = errors.New(
	"folder recipes need a registryUrl on raw.githubusercontent.com, so the folder can be listed through the GitHub API",
)

// fetchSourceFolder returns the files directly inside the folder at
// base/source, in listing order: through the GitHub contents API under a raw
// GitHub base, from disk under a file:// or path base.
func (f fetcher) fetchSourceFolder(ctx context.Context, base, source string) ([]FetchedFile, error) {
	if location, ok := f.parseRawGitHubURL(strings.TrimRight(base, "/")); ok {
		return f.fetchGitHubFolder(ctx, location, source)
	}

	if isHTTPURL(base) {
		return nil, fmt.Errorf("list folder %s: %w", joinRegistryURL(base, source), ErrFolderNeedsGitHub)
	}

	dir, err := localPath(joinRegistryURL(base, source))
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("list folder %q: %w", dir, err)
	}

	files := make([]FetchedFile, 0, len(entries))

	for _, entry := range entries {
		if !entry.Type().IsRegular() {
			continue
		}

		data, err := os.ReadFile(filepath.Join(dir, entry.Name())) //nolint:gosec // G304: a file of the registry the caller chose
		if err != nil {
			return nil, fmt.Errorf("read %q: %w", filepath.Join(dir, entry.Name()), err)
		}

		files = append(files, FetchedFile{Path: entry.Name(), Content: string(data)})
	}

	return files, nil
}

func (f fetcher) fetchGitHubFolder(ctx context.Context, location rawGitHubLocation, source string) ([]FetchedFile, error) {
	folderPath := source
	if location.basePath != "" {
		folderPath = collapseSlashes(location.basePath + "/" + source)
	}

	where := fmt.Sprintf("%s/%s@%s/%s", location.owner, location.repo, location.ref, folderPath)
	listing := fmt.Sprintf("%s/repos/%s/%s/contents/%s?ref=%s", f.github.API, location.owner, location.repo, folderPath, location.ref)

	data, err := f.get(ctx, listing, githubAcceptHeader, maxRegistryResponseBytes)
	if err != nil {
		return nil, fmt.Errorf("load recipe folder %s: list the folder: %w", where, err)
	}

	var entries []githubFolderEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		var single map[string]any
		if json.Unmarshal(data, &single) == nil {
			return nil, fmt.Errorf("load recipe folder %s: %w", where, ErrNotAFolder)
		}

		return nil, fmt.Errorf("load recipe folder %s: parse the listing: %w", where, err)
	}

	files := make([]FetchedFile, 0, len(entries))

	for _, entry := range entries {
		if entry.Type != "file" {
			continue
		}

		if entry.DownloadURL == nil {
			return nil, fmt.Errorf(
				"load recipe folder %s: file %s has no download URL in the GitHub listing; list it as its own file entry in the registry",
				where, entry.Path,
			)
		}

		content, err := f.get(ctx, *entry.DownloadURL, "", maxRecipeFileBytes)
		if err != nil {
			return nil, fmt.Errorf("load recipe folder %s: download %s: %w", where, entry.Path, err)
		}

		relative := entry.Path
		if rest, found := strings.CutPrefix(entry.Path, folderPath); found {
			relative = strings.TrimPrefix(rest, "/")
		}

		files = append(files, FetchedFile{Path: relative, Content: string(content)})
	}

	return files, nil
}

func collapseSlashes(value string) string {
	for strings.Contains(value, "//") {
		value = strings.ReplaceAll(value, "//", "/")
	}

	return value
}
