// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// fakeFetcher serves remote pack files from a map keyed by URL.
func fakeFetcher(files map[string]string) PackFetcher {
	return func(_ context.Context, target string) (int, string, error) {
		body, ok := files[target]
		if !ok {
			return http.StatusNotFound, "", nil
		}

		return http.StatusOK, body, nil
	}
}

const packBase = "https://raw.githubusercontent.com/eser/rules/main/packs/web/"

func TestInstallRemotePack(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, ".eser/concerns/004-existing.json"), "{}")

	fetch := fakeFetcher(map[string]string{
		packBase + "pack.json":              `{"name":"web","version":"2.0.0","description":"Web rules","rules":["rules/a.md"],"concerns":["concerns/c.json"],"folderRules":{"src/ui":"folder.md"}}`,
		packBase + "rules/a.md":             "Rule A\n",
		packBase + "concerns/c.json":        `{"id":"web-quality","reminders":[]}`,
		packBase + "folder.md":              "- Keep components small\n",
		packBase + "rules/escape.md":        "x",
		packBase + "concerns/escape.json":   `{"id":"../../outside"}`,
		packBase + "concerns/badscope.json": `{"id":"bad","reminders":[{"text":"x","scope":["nowhere"]}]}`,
	})

	manifest, err := FetchRemotePackManifest(context.Background(), fetch, "github:eser/rules#web")
	if err != nil {
		t.Fatal(err)
	}

	record, err := InstallRemotePack(context.Background(), fetch, root, "github:eser/rules#web", manifest, time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}

	want := `{"name":"web","version":"2.0.0","installedAt":"1970-01-01T00:00:00.000Z","source":"github:eser/rules#web",` +
		`"rules":["pack-web-a.md"],"concerns":["005-web-quality.json"],"folderRules":["src/ui/.folder-rules.md"]}`
	if record.String() != want {
		t.Errorf("record %s", record)
	}

	if got := readTestFile(t, filepath.Join(root, "src/ui/.folder-rules.md")); got != "- Keep components small\n" {
		t.Errorf("folder rules %q", got)
	}

	refusals := []struct {
		name, manifest string
	}{
		{"a concern id that leaves the folder", `{"name":"web","version":"1","description":"d","concerns":["concerns/escape.json"]}`},
		{"a folder outside the project", `{"name":"web","version":"1","description":"d","folderRules":{"../outside":"folder.md"}}`},
		{"a pack name with a separator", `{"name":"a/b","version":"1","description":"d"}`},
		{"an unknown scope", `{"name":"web","version":"1","description":"d","concerns":["concerns/badscope.json"]}`},
	}

	for _, tc := range refusals {
		parsed, _ := parseJSON(tc.manifest)

		if _, err := InstallRemotePack(context.Background(), fetch, t.TempDir(), "github:eser/rules#web", parsed.(*JSObject), time.Now()); err == nil {
			t.Errorf("%s: installed", tc.name)
		}
	}

	if _, err := os.Stat(filepath.Join(filepath.Dir(root), "outside")); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("a pack wrote outside the project: %v", err)
	}
}

func TestRemotePackErrors(t *testing.T) {
	t.Parallel()

	fetch := fakeFetcher(map[string]string{
		"https://raw.githubusercontent.com/eser/rules/main/packs/bad/pack.json": `{"name":"bad","version":""}`,
	})

	for _, tc := range []struct{ specifier, want string }{
		{"eser/rules", "Invalid pack specifier: eser/rules. Expected format: github:owner/repo#pack-name"},
		{"gh:eser/rules#missing", "Could not fetch pack from gh:eser/rules#missing. HTTP 404"},
		{"eser/rules#bad", "Pack manifest must have a non-empty 'version' field"},
	} {
		if _, err := FetchRemotePackManifest(context.Background(), fetch, tc.specifier); err == nil || err.Error() != tc.want {
			t.Errorf("%s: %v", tc.specifier, err)
		}
	}
}

func TestInternalAddressKind(t *testing.T) {
	t.Parallel()

	for host, want := range map[string]string{
		"localhost": "loopback", "LOCALHOST.": "loopback", "127.0.0.1": "loopback", "10.1.2.3": "private",
		"172.16.0.1": "private", "172.32.0.1": "", "192.168.1.1": "private", "100.64.0.1": "shared",
		"169.254.169.254": "link-local", "0.0.0.0": "unspecified", "224.0.0.1": "multicast", "240.0.0.1": "reserved",
		"198.18.0.1": "reserved", "8.8.8.8": "", "[::1]": "loopback", "[::]": "unspecified",
		"[::ffff:169.254.169.254]": "link-local", "[64:ff9b::10.0.0.1]": "private", "[fd00::1]": "private",
		"[fe80::1]": "link-local", "[ff02::1]": "multicast", "[2001:db8::1]": "", "example.com": "", "999.1.1.1": "",
	} {
		if got := InternalAddressKind(host); got != want {
			t.Errorf("InternalAddressKind(%q) = %q, want %q", host, got, want)
		}
	}
}

func TestParseRegistryURL(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		value any
		want  string
	}{
		{"https://packs.example.com/registry.json", ""},
		{"http://localhost:8080/r.json", ""},
		{"http://packs.example.com/r.json", "must use https://"},
		{"https://user:secret@packs.example.com/r.json", "must not contain a user name or password"},
		{"https://169.254.169.254/latest", "points at a link-local address"},
		{"not a url", "is not an absolute URL"},
		{float64(3), "must be a URL string, got number"},
		{nil, "must be a URL string, got object"},
	} {
		_, err := ParseRegistryURL(tc.value)

		switch {
		case tc.want == "" && err != nil:
			t.Errorf("%v: %v", tc.value, err)
		case tc.want != "" && (err == nil || !strings.Contains(err.Error(), tc.want)):
			t.Errorf("%v: %v, want %q", tc.value, err, tc.want)
		}

		if err != nil && strings.Contains(err.Error(), "secret") {
			t.Errorf("the error names the password: %v", err)
		}
	}
}

func TestFetchRegistry(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ok":
			_, _ = w.Write([]byte(`{"packs":[{"name":"web","description":"Web","version":"1","source":"remote","tags":["ui"]}]}`))
		case "/redirect":
			http.Redirect(w, r, "http://169.254.169.254/", http.StatusFound)
		case "/control":
			_, _ = w.Write([]byte(`{"packs":[{"name":"x\u001b[2J","description":"","version":"","source":"remote"}]}`))
		case "/large":
			_, _ = w.Write([]byte(strings.Repeat(" ", MaxRegistryBytes+1)))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	loopback := strings.Replace(server.URL, "127.0.0.1", "localhost", 1)

	for _, tc := range []struct{ path, want string }{
		{"/ok", ""},
		{"/redirect", "redirects to http://169.254.169.254/"},
		{"/control", "packs[0].name must be a non-empty string without control characters"},
		{"/large", "larger than"},
		{"/missing", "answered HTTP 404"},
	} {
		u, err := ParseRegistryURL(loopback + tc.path)
		if err != nil {
			t.Fatal(err)
		}

		entries, err := FetchRegistry(context.Background(), NewRegistryClient(u), u)

		switch {
		case tc.want == "" && (err != nil || len(entries) != 1 || entries[0].Tags[0] != "ui"):
			t.Errorf("%s: %+v, %v", tc.path, entries, err)
		case tc.want != "" && (err == nil || !strings.Contains(err.Error(), tc.want)):
			t.Errorf("%s: %v, want %q", tc.path, err, tc.want)
		}
	}

	// A public host name that resolves to a loopback address is refused when
	// the client dials.
	public, _ := url.Parse("https://packs.example.com/ok")
	client := NewRegistryClient(public)

	_, err := client.Get(server.URL + "/ok") //nolint:noctx // the dial check is what is tested
	if err == nil || !strings.Contains(err.Error(), "internal addresses") {
		t.Errorf("dialed a loopback address for a public registry: %v", err)
	}
}
