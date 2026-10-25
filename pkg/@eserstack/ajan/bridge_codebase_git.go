// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"context"
	"encoding/json"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// ---------------------------------------------------------------------------
// Codebase bridge
// ---------------------------------------------------------------------------

type codebaseGitRequest struct {
	Dir   string `json:"dir"`
	Start string `json:"start"`
	End   string `json:"end"`
	Since string `json:"since"`
}

type codebaseGitResponse struct {
	Branch  string               `json:"branch,omitempty"`
	Tag     string               `json:"tag,omitempty"`
	Commits []codebaseCommitJSON `json:"commits,omitempty"`
	Error   string               `json:"error,omitempty"`
}

type codebaseCommitJSON struct {
	Hash    string `json:"hash"`
	Subject string `json:"subject"`
	Body    string `json:"body,omitempty"`
}

type codebaseChangelogRequest struct {
	Dir     string `json:"dir"`
	Version string `json:"version,omitempty"`
	DryRun  bool   `json:"dryRun"`
}

type codebaseChangelogResponse struct {
	Version     string `json:"version,omitempty"`
	CommitCount int    `json:"commitCount,omitempty"`
	EntryCount  int    `json:"entryCount,omitempty"`
	Content     string `json:"content,omitempty"`
	DryRun      bool   `json:"dryRun"`
	Error       string `json:"error,omitempty"`
}

// bridgeCodebaseGitCurrentBranch returns the current git branch.
func bridgeCodebaseGitCurrentBranch(requestJSON string) string {
	var req codebaseGitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseGitResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	dir := req.Dir
	if dir == "" {
		dir = "."
	}

	branch, err := codebasefx.GetCurrentBranch(context.Background(), dir)
	if err != nil {
		return marshalResponse(codebaseGitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseGitResponse{Branch: branch}) //nolint:exhaustruct
}

// bridgeCodebaseGitLatestTag returns the most recent git tag.
func bridgeCodebaseGitLatestTag(requestJSON string) string {
	var req codebaseGitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseGitResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	dir := req.Dir
	if dir == "" {
		dir = "."
	}

	tag, err := codebasefx.GetLatestTag(context.Background(), dir)
	if err != nil {
		return marshalResponse(codebaseGitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseGitResponse{Tag: tag}) //nolint:exhaustruct
}

// bridgeCodebaseGitLog returns commits between two refs or since a date.
func bridgeCodebaseGitLog(requestJSON string) string {
	var req codebaseGitRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseGitResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	dir := req.Dir
	if dir == "" {
		dir = "."
	}

	var commits []codebasefx.Commit
	var err error

	switch {
	case req.Start != "" && req.End != "":
		commits, err = codebasefx.GetCommitsBetween(context.Background(), dir, req.Start, req.End)
	case req.Since != "":
		commits, err = codebasefx.GetCommitsSinceDate(context.Background(), dir, req.Since)
	default:
		commits, err = codebasefx.GetCommitsSinceDate(context.Background(), dir, "1970-01-01")
	}

	if err != nil {
		return marshalResponse(codebaseGitResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	jsonCommits := make([]codebaseCommitJSON, 0, len(commits))
	for _, c := range commits {
		jsonCommits = append(jsonCommits, codebaseCommitJSON{
			Hash:    c.Hash,
			Subject: c.Subject,
			Body:    c.Body,
		})
	}

	return marshalResponse(codebaseGitResponse{Commits: jsonCommits}) //nolint:exhaustruct
}

// bridgeCodebaseGenerateChangelog generates a changelog section from git history.
func bridgeCodebaseGenerateChangelog(requestJSON string) string {
	var req codebaseChangelogRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(codebaseChangelogResponse{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	result, err := codebasefx.GenerateChangelog(context.Background(), codebasefx.GenerateChangelogOptions{
		Root:    req.Dir,
		Version: req.Version,
		DryRun:  req.DryRun,
	})
	if err != nil {
		return marshalResponse(codebaseChangelogResponse{Error: err.Error()}) //nolint:exhaustruct
	}

	return marshalResponse(codebaseChangelogResponse{
		Version:     result.Version,
		CommitCount: result.CommitCount,
		EntryCount:  result.EntryCount,
		Content:     result.Content,
		DryRun:      result.DryRun,
	})
}

func init() {
	register("codebaseGitCurrentBranch", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseGitCurrentBranch(a[0]) })
	register("codebaseGitLatestTag", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseGitLatestTag(a[0]) })
	register("codebaseGitLog", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseGitLog(a[0]) })
	register("codebaseGenerateChangelog", []string{"requestJSON"}, func(a []string) string { return bridgeCodebaseGenerateChangelog(a[0]) })
}
