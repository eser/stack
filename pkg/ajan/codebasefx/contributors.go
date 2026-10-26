// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
)

// The contributor list markers in README.md.
const (
	ContributorsStart = "<!-- CONTRIBUTORS:START -->"
	ContributorsEnd   = "<!-- CONTRIBUTORS:END -->"
)

var errNoContributorMarkers = errors.New("could not find contributor markers in README")

// Contributor is one entry of the GitHub contributors API.
type Contributor struct {
	Login     string `json:"login"`
	HTMLURL   string `json:"html_url"`
	AvatarURL string `json:"avatar_url"`
}

// decodeContributorPages reads `gh api --paginate` output, which is one JSON
// array per page written back to back, and drops bots.
func decodeContributorPages(raw string) ([]Contributor, error) {
	dec := json.NewDecoder(strings.NewReader(raw))

	var all []Contributor

	for {
		var page []Contributor

		err := dec.Decode(&page)
		if errors.Is(err, io.EOF) {
			break
		}

		if err != nil {
			return nil, fmt.Errorf("parse the contributors: %w", err)
		}

		for _, c := range page {
			if !strings.Contains(c.Login, "[bot]") {
				all = append(all, c)
			}
		}
	}

	return all, nil
}

// ContributorTable renders the contributors as the README's HTML table,
// columns per row, between the markers.
func ContributorTable(contributors []Contributor, columns int) string {
	if len(contributors) == 0 {
		return ContributorsStart + "\n" + ContributorsEnd
	}

	if columns <= 0 {
		columns = 8
	}

	var rows []string

	for i := 0; i < len(contributors); i += columns {
		end := min(i+columns, len(contributors))
		cells := make([]string, 0, end-i)

		for _, c := range contributors[i:end] {
			cells = append(cells, fmt.Sprintf(
				`    <td align="center"><a href="%s"><img src="%s?s=80" width="80" /><br /><sub>%s</sub></a></td>`,
				c.HTMLURL, c.AvatarURL, c.Login))
		}

		rows = append(rows, "  <tr>\n"+strings.Join(cells, "\n")+"\n  </tr>")
	}

	return ContributorsStart + "\n<table>\n" + strings.Join(rows, "\n") + "\n</table>\n" + ContributorsEnd
}

// ReplaceContributorSection swaps the text between the markers (inclusive).
func ReplaceContributorSection(readme, table string) (string, bool, error) {
	start := strings.Index(readme, ContributorsStart)
	end := strings.Index(readme, ContributorsEnd)

	if start < 0 || end < 0 {
		return "", false, fmt.Errorf("%w: add %q and %q to the file", errNoContributorMarkers, ContributorsStart, ContributorsEnd)
	}

	updated := readme[:start] + table + readme[end+len(ContributorsEnd):]

	return updated, updated != readme, nil
}

// UpdateContributors fetches the repository's contributors with gh, rewrites
// the README section, and with commit set commits it as github-actions[bot]
// and pushes. It returns the contributor count and whether the README changed.
func UpdateContributors(ctx context.Context, env *ReleaseEnv, readmePath string, columns int, commit bool) (int, bool, error) {
	repoJSON, err := env.gh(ctx, "repo", "view", "--json", "owner,name")
	if err != nil {
		return 0, false, err
	}

	var repo struct {
		Owner struct {
			Login string `json:"login"`
		} `json:"owner"`
		Name string `json:"name"`
	}

	if err := json.Unmarshal([]byte(repoJSON), &repo); err != nil {
		return 0, false, fmt.Errorf("parse gh repo view: %w", err)
	}

	raw, err := env.gh(ctx, "api", fmt.Sprintf("repos/%s/%s/contributors", repo.Owner.Login, repo.Name), "--paginate")
	if err != nil {
		return 0, false, err
	}

	contributors, err := decodeContributorPages(raw)
	if err != nil {
		return 0, false, err
	}

	readme, err := os.ReadFile(readmePath) //nolint:gosec // G304: the README the caller names
	if err != nil {
		return 0, false, fmt.Errorf("read %s: %w", readmePath, err)
	}

	updated, changed, err := ReplaceContributorSection(string(readme), ContributorTable(contributors, columns))
	if err != nil || !changed {
		return len(contributors), false, err
	}

	if err := os.WriteFile(readmePath, []byte(updated), 0o644); err != nil { //nolint:gosec // G306: a repository file
		return len(contributors), false, fmt.Errorf("write %s: %w", readmePath, err)
	}

	if !commit {
		return len(contributors), true, nil
	}

	steps := [][]string{
		{"add", readmePath},
		{"-c", "user.name=github-actions[bot]", "-c", "user.email=github-actions[bot]@users.noreply.github.com", "commit", "-m", "docs: update contributors list"},
		{"push"},
	}

	for _, args := range steps {
		if _, err := runGit(ctx, env.Root, args...); err != nil {
			return len(contributors), true, err
		}
	}

	return len(contributors), true, nil
}
