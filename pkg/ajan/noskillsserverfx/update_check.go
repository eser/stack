package noskillsserverfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	githubReleasesURL = "https://api.github.com/repos/eser/stack/releases/latest"

	// updateCheckTimeout bounds the whole request, so an unreachable or slow
	// GitHub cannot keep the check running.
	updateCheckTimeout = 5 * time.Second

	// releaseBodyLimit caps what is read from the releases API. The release
	// document is a few kilobytes; the cap keeps a misbehaving proxy from
	// streaming an unbounded body into the decoder.
	releaseBodyLimit = 1 << 20
)

// ErrUpdateCheck is wrapped by every error CheckForUpdate returns.
var ErrUpdateCheck = errors.New("update check")

// CheckForUpdate asks GitHub for the latest release and, when it is newer than
// this build, writes a one-line notice to out. ctx bounds the request together
// with a 5s timeout.
//
// It runs in the caller's goroutine. A daemon that must not wait for GitHub
// runs it through an owner such as processfx.Process.StartGoroutine, which
// waits for it on shutdown. The returned error says why the check failed (no
// network, a rate limit, an unreadable reply); the daemon works the same
// without the check, so the caller decides how loudly to log it.
func CheckForUpdate(ctx context.Context, out io.Writer) error {
	return checkForUpdate(ctx, http.DefaultClient, githubReleasesURL, Version, out)
}

func checkForUpdate(
	ctx context.Context,
	client *http.Client,
	releasesURL, current string,
	out io.Writer,
) error {
	latest, err := fetchLatestVersion(ctx, client, releasesURL)
	if err != nil {
		return err
	}

	if !isNewer(latest, current) {
		return nil
	}

	_, err = fmt.Fprintf(out,
		"\n  noskills-server %s is available (you have %s). "+
			"Upgrade with: brew upgrade eser/tap/noskills-server, "+
			"or see https://github.com/eser/stack/releases/latest\n\n",
		latest, current)
	if err != nil {
		return fmt.Errorf("%w: write the update notice: %w", ErrUpdateCheck, err)
	}

	return nil
}

// fetchLatestVersion returns the latest release's version without the "v"
// prefix of its tag.
func fetchLatestVersion(ctx context.Context, client *http.Client, releasesURL string) (string, error) {
	reqCtx, cancel := context.WithTimeout(ctx, updateCheckTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, releasesURL, nil)
	if err != nil {
		return "", fmt.Errorf("%w: build request for %s: %w", ErrUpdateCheck, releasesURL, err)
	}

	req.Header.Set("User-Agent", "noskills-server/"+Version)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: fetch latest release: %w", ErrUpdateCheck, err)
	}

	defer func() { _ = resp.Body.Close() }() // a read-only body; the decode result is what counts

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: fetch latest release from %s: status %d",
			ErrUpdateCheck, releasesURL, resp.StatusCode)
	}

	var release struct {
		TagName string `json:"tag_name"`
	}

	if err := json.NewDecoder(io.LimitReader(resp.Body, releaseBodyLimit)).Decode(&release); err != nil {
		return "", fmt.Errorf("%w: decode latest release: %w", ErrUpdateCheck, err)
	}

	if release.TagName == "" {
		return "", fmt.Errorf("%w: latest release from %s has no tag_name", ErrUpdateCheck, releasesURL)
	}

	// Strip leading 'v' prefix common in git tags (v1.2.3 → 1.2.3).
	return strings.TrimPrefix(release.TagName, "v"), nil
}

// isNewer returns true when latest is a strictly greater semver than current.
// Comparison is done field-by-field on the first three dot-separated integers.
// Non-numeric or malformed segments cause the function to return false (safe default).
func isNewer(latest, current string) bool {
	lp := versionParts(latest)
	cp := versionParts(current)

	for i := range 3 {
		if lp[i] > cp[i] {
			return true
		}

		if lp[i] < cp[i] {
			return false
		}
	}

	return false
}

func versionParts(v string) [3]int {
	var parts [3]int
	segs := strings.SplitN(v, ".", 3)

	for i, s := range segs {
		if i >= 3 {
			break
		}
		// Parse only leading digits (ignore pre-release suffixes like "-rc1").
		n := 0
		for _, c := range s {
			if c < '0' || c > '9' {
				break
			}
			n = n*10 + int(c-'0')
		}
		parts[i] = n //nolint:gosec // i<3 guaranteed: SplitN(n=3) + guard above
	}

	return parts
}
