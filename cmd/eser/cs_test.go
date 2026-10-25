// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/csfx"
	"gopkg.in/yaml.v3"
)

// csFixture is a layered set of .env files: each later file replaces some of
// the earlier values, and .env.local is left out for the test environment.
var csFixture = map[string]string{ //nolint:gochecknoglobals
	".env":               "# shared\nAPP_NAME=fixture\nLOG_LEVEL=info\nexport REGION=eu-west-1\nEMPTY=\nQUOTED=\"a # b\"\n",
	".env.staging":       "LOG_LEVEL=debug\nAPI_URL='https://staging.example.com/api'\nUNICODE=ğüşiöç\n",
	".env.local":         "LOCAL_ONLY=yes\nAPP_NAME=fixture-local\n",
	".env.staging.local": "SECRET_TOKEN=s3cr3t value\n",
	".env.test":          "LOG_LEVEL=warn\n",
}

func writeCSFixture(t *testing.T, dir string) {
	t.Helper()

	for name, content := range csFixture {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

func runCLI(t *testing.T, e *env, args ...string) (string, string, int) {
	t.Helper()

	stdout, stderr := &bytes.Buffer{}, &bytes.Buffer{}
	e.stdout, e.stderr = stdout, stderr

	code := run(context.Background(), e, args)

	return stdout.String(), stderr.String(), code
}

var csGenerateCases = [][]string{ //nolint:gochecknoglobals
	{"generate", "cm/app-config", "-e", "staging"},
	{"generate", "configmap/app-config", "-e", "staging", "-n", "production", "-o", "json"},
	{"generate", "secret/app-secrets", "-e", "staging", "-o", "yaml"},
	{"generate", "secret/app-secrets", "--env", "test", "--namespace", "default", "--output", "json"},
	{"generate", "cm/app-config"}, // the development environment by default
}

// TestCSGenerateMatchesTypeScript runs each case through the TypeScript cs
// CLI and the Go one on the same fixture and compares the output.
func TestCSGenerateMatchesTypeScript(t *testing.T) {
	t.Parallel()

	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node is not installed; the TypeScript comparison needs it")
	}

	repo, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}

	for _, args := range csGenerateCases {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			t.Parallel()

			e := testEnv(t)
			writeCSFixture(t, e.cwd)

			goOut, goErr, code := runCLI(t, e, append([]string{"cs"}, args...)...)
			if code != 0 {
				t.Fatalf("eser cs: exit %d: %s", code, goErr)
			}

			// The TypeScript CLI through the native ajan library when it loads,
			// and with ESER_AJAN=disabled on its own TypeScript code.
			for _, ajan := range []string{"", "ESER_AJAN=disabled"} {
				cmd := exec.Command(node, append([]string{ //nolint:gosec,noctx
					filepath.Join(repo, "pkg/@eserstack/cs/cli.ts"),
				}, args...)...)
				cmd.Dir = e.cwd
				// Neither side reads process variables for generate, but the
				// environment name falls back to $ENV and friends.
				cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME"), ajan}

				tsOut, err := cmd.Output()
				if err != nil {
					t.Fatalf("TypeScript cs %s: %v", ajan, err)
				}

				if goOut == string(tsOut) {
					continue
				}

				// The TypeScript yaml library and yaml.v3 quote some scalars
				// differently ("a # b" against 'a # b', yes against "yes");
				// the documents must still hold the same values.
				if ajan != "" && !slices.Contains(args, "json") && sameYAML(t, goOut, string(tsOut)) {
					continue
				}

				t.Errorf("%s\n--- TypeScript\n%s\n--- Go\n%s", ajan, tsOut, goOut)
			}
		})
	}
}

func sameYAML(t *testing.T, a, b string) bool {
	t.Helper()

	var va, vb any
	if err := yaml.Unmarshal([]byte(a), &va); err != nil {
		t.Fatal(err)
	}

	if err := yaml.Unmarshal([]byte(b), &vb); err != nil {
		t.Fatal(err)
	}

	return reflect.DeepEqual(va, vb)
}

func TestCSGenerateReadsTheLayers(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	writeCSFixture(t, e.cwd)

	out, _, code := runCLI(t, e, "cs", "generate", "cm/app", "-e", "staging", "-o", "json")
	if code != 0 {
		t.Fatalf("exit %d", code)
	}

	for _, want := range []string{
		`"APP_NAME": "fixture-local"`, `"LOG_LEVEL": "debug"`, `"SECRET_TOKEN": "s3cr3t value"`,
		`"EMPTY": ""`, `"QUOTED": "a # b"`, `"REGION": "eu-west-1"`,
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output should contain %s:\n%s", want, out)
		}
	}

	out, _, _ = runCLI(t, e, "cs", "generate", "cm/app", "-e", "test", "-o", "json")
	if strings.Contains(out, "LOCAL_ONLY") || !strings.Contains(out, `"LOG_LEVEL": "warn"`) {
		t.Errorf("the test environment skips .env.local:\n%s", out)
	}

	e.environ = func() []string { return []string{"APP_ENV=staging"} }

	if out, _, _ = runCLI(t, e, "cs", "generate", "cm/app", "-o", "json"); !strings.Contains(out, `"LOG_LEVEL": "debug"`) {
		t.Errorf("APP_ENV names the environment:\n%s", out)
	}
}

func TestCSSync(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	writeCSFixture(t, e.cwd)
	e.environ = func() []string { return []string{"LOG_LEVEL=from-process"} }
	e.resourceKeys = func(ref csfx.ResourceReference) ([]string, error) {
		if ref.Name != "app" || ref.Namespace != "prod" {
			t.Errorf("resource %+v", ref)
		}

		return []string{"APP_NAME", "LOG_LEVEL", "NOT_DEFINED"}, nil
	}

	out, stderr, code := runCLI(t, e, "cs", "sync", "cm/app", "-n", "prod", "-e", "staging")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	if want := `kubectl patch cm app -n prod --type=merge -p '{"data":{"APP_NAME":"fixture-local","LOG_LEVEL":"from-process"}}'`; strings.TrimSpace(out) != want {
		t.Errorf("got  %s\nwant %s", out, want)
	}

	if !strings.Contains(stderr, "Warning: NOT_DEFINED is in configmap/app but not in the environment") {
		t.Errorf("missing-key warning: %q", stderr)
	}

	out, _, _ = runCLI(t, e, "cs", "sync", "secret/app", "-n", "prod", "-e", "staging", "-s")
	if want := `{"data":{"APP_NAME":"Zml4dHVyZS1sb2NhbA==","LOG_LEVEL":"ZnJvbS1wcm9jZXNz"}}`; strings.TrimSpace(out) != want {
		t.Errorf("string-only secret patch %s", out)
	}
}

func TestCSUsageErrors(t *testing.T) {
	t.Parallel()

	e := testEnv(t)

	for _, args := range [][]string{
		{"cs", "generate"},
		{"cs", "generate", "deployment/x"},
		{"cs", "generate", "cm/"},
		{"cs", "generate", "cm/x", "-o", "toml"},
	} {
		if _, _, code := runCLI(t, e, args...); code != 2 {
			t.Errorf("%v: exit %d, want 2", args, code)
		}
	}
}
