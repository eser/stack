package noskillsserverfx

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const githubReleasesURL = "https://api.github.com/repos/eser/stack/releases/latest"

// CheckForUpdateAsync spawns a goroutine that queries GitHub releases and
// prints a one-line banner if a newer version is available. The check has a
// 5 s timeout and is fully silent on any error (network unavailable, rate
// limit, parse error) so it never blocks or disrupts daemon startup.
func CheckForUpdateAsync() {
	go func() {
		latest, err := fetchLatestVersion(context.Background())
		if err != nil || latest == "" {
			return
		}

		if isNewer(latest, Version) {
			fmt.Printf("\n  ✦ noskills-server %s is available (you have %s) — brew upgrade eserstack/tap/noskills-server\n\n",
				latest, Version)
		}
	}()
}

func fetchLatestVersion(ctx context.Context) (string, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, githubReleasesURL, nil)
	if err != nil {
		return "", err //nolint:wrapcheck
	}

	req.Header.Set("User-Agent", "noskills-server/"+Version)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err //nolint:wrapcheck
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", nil
	}

	var release struct {
		TagName string `json:"tag_name"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", err //nolint:wrapcheck
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
