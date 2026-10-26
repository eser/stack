// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"testing"
)

// fakeGitHub serves the three GitHub hosts kit reads from, out of local
// directories: raw.githubusercontent.com (files), api.github.com (folder
// listings) and codeload.github.com (tarballs). repos maps "owner/repo" to
// the directory that holds the repository at every ref.
type fakeGitHub struct {
	repos map[string]string
}

func hostOf(r *http.Request) string {
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}

	return host
}

func (g *fakeGitHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	parts := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/"), "/", 4)

	switch hostOf(r) {
	case "raw.githubusercontent.com":
		// /owner/repo/ref/path
		if len(parts) < 4 {
			http.NotFound(w, r)

			return
		}

		g.serveRaw(w, r, parts[0]+"/"+parts[1], parts[3])
	case "api.github.com":
		// /repos/owner/repo/contents/path?ref=ref
		rest := strings.SplitN(strings.TrimPrefix(r.URL.Path, "/repos/"), "/", 4)
		if len(rest) < 3 || rest[2] != "contents" {
			http.NotFound(w, r)

			return
		}

		folder := ""
		if len(rest) == 4 {
			folder = rest[3]
		}

		g.serveListing(w, r, rest[0]+"/"+rest[1], folder, r.URL.Query().Get("ref"))
	case "codeload.github.com":
		// /owner/repo/tar.gz/ref
		if len(parts) < 4 || parts[2] != "tar.gz" {
			http.NotFound(w, r)

			return
		}

		g.serveTarball(w, r, parts[0], parts[1], parts[3])
	default:
		http.Error(w, "unknown host "+r.Host, http.StatusBadGateway)
	}
}

func (g *fakeGitHub) repoPath(repo, rel string) (string, bool) {
	root, ok := g.repos[repo]
	if !ok {
		return "", false
	}

	cleaned := path.Clean("/" + rel)

	return filepath.Join(root, filepath.FromSlash(cleaned)), true
}

func (g *fakeGitHub) serveRaw(w http.ResponseWriter, r *http.Request, repo, rel string) {
	full, ok := g.repoPath(repo, rel)
	if !ok {
		http.NotFound(w, r)

		return
	}

	data, err := os.ReadFile(full) //nolint:gosec // a fixture file
	if err != nil {
		http.NotFound(w, r)

		return
	}

	_, _ = w.Write(data)
}

func (g *fakeGitHub) serveListing(w http.ResponseWriter, r *http.Request, repo, folder, ref string) {
	full, ok := g.repoPath(repo, folder)
	if !ok {
		http.NotFound(w, r)

		return
	}

	entries, err := os.ReadDir(full)
	if err != nil {
		http.NotFound(w, r)

		return
	}

	type item struct {
		Type        string `json:"type"`
		Name        string `json:"name"`
		Path        string `json:"path"`
		DownloadURL any    `json:"download_url"` //nolint:tagliatelle // the GitHub API's field name
	}

	base := strings.Trim(path.Clean("/"+folder), "/")
	listing := make([]item, 0, len(entries))

	for _, entry := range entries {
		itemPath := path.Join(base, entry.Name())
		if entry.IsDir() {
			listing = append(listing, item{Type: "dir", Name: entry.Name(), Path: itemPath, DownloadURL: nil})

			continue
		}

		listing = append(listing, item{
			Type:        "file",
			Name:        entry.Name(),
			Path:        itemPath,
			DownloadURL: "https://raw.githubusercontent.com/" + repo + "/" + ref + "/" + itemPath,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(listing)
}

// serveTarball writes the repository as GitHub does: a pax global header,
// then every directory and file under a "repo-ref/" prefix, plus a symlink
// that extraction must skip.
func (g *fakeGitHub) serveTarball(w http.ResponseWriter, r *http.Request, owner, repo, ref string) {
	root, ok := g.repos[owner+"/"+repo]
	if !ok {
		http.NotFound(w, r)

		return
	}

	var buf bytes.Buffer

	if err := writeRepoTarball(&buf, root, repo+"-"+ref); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)

		return
	}

	_, _ = w.Write(buf.Bytes())
}

func writeRepoTarball(w io.Writer, root, prefix string) error {
	gz := gzip.NewWriter(w)
	tw := tar.NewWriter(gz)

	err := tw.WriteHeader(&tar.Header{ //nolint:exhaustruct
		Typeflag:   tar.TypeXGlobalHeader,
		Name:       "pax_global_header",
		PAXRecords: map[string]string{"comment": "0123456789abcdef"},
	})
	if err != nil {
		return err
	}

	err = filepath.WalkDir(root, func(full string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		rel, err := filepath.Rel(root, full)
		if err != nil {
			return err
		}

		name := path.Join(prefix, filepath.ToSlash(rel))

		if entry.IsDir() {
			return tw.WriteHeader(&tar.Header{Typeflag: tar.TypeDir, Name: name + "/", Mode: 0o755}) //nolint:exhaustruct
		}

		data, err := os.ReadFile(full) //nolint:gosec // a fixture file
		if err != nil {
			return err
		}

		if err := tw.WriteHeader(&tar.Header{Typeflag: tar.TypeReg, Name: name, Mode: 0o644, Size: int64(len(data))}); err != nil { //nolint:exhaustruct
			return err
		}

		_, err = tw.Write(data)

		return err
	})
	if err != nil {
		return err
	}

	err = tw.WriteHeader(&tar.Header{Typeflag: tar.TypeSymlink, Name: prefix + "/escape", Linkname: "/etc/passwd"}) //nolint:exhaustruct
	if err != nil {
		return err
	}

	return errors.Join(tw.Close(), gz.Close())
}

// rewriteTransport sends every request to target, keeping the original host
// in the Host header, so the fake serves it as that host.
type rewriteTransport struct {
	target *url.URL
}

func (t rewriteTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	clone := r.Clone(r.Context())
	clone.Host = r.URL.Host
	clone.URL.Scheme = t.target.Scheme
	clone.URL.Host = t.target.Host

	return http.DefaultTransport.RoundTrip(clone) //nolint:wrapcheck // a test transport
}

// startFakeGitHub serves g over plain HTTP and returns a client whose
// requests to any host reach it.
func startFakeGitHub(t *testing.T, g *fakeGitHub) *http.Client {
	t.Helper()

	server := httptest.NewServer(g)
	t.Cleanup(server.Close)

	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}

	return &http.Client{Transport: rewriteTransport{target: target}} //nolint:exhaustruct
}

// writeFiles writes path -> content under dir.
func writeFiles(t *testing.T, dir string, files map[string]string) {
	t.Helper()

	for rel, content := range files {
		full := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

// readTree returns every file under dir as relative path -> content.
func readTree(t *testing.T, dir string) map[string]string {
	t.Helper()

	tree := map[string]string{}

	err := filepath.WalkDir(dir, func(full string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		if entry.IsDir() {
			return nil
		}

		rel, err := filepath.Rel(dir, full)
		if err != nil {
			return err
		}

		data, err := os.ReadFile(full) //nolint:gosec // a file the test wrote
		if err != nil {
			return err
		}

		tree[filepath.ToSlash(rel)] = string(data)

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	return tree
}
