// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// RunKubectl retrieves the data keys from an existing Kubernetes resource by
// executing `kubectl get <type>/<name> -o json`. Returns an error when the
// kubectl command fails or its JSON output cannot be parsed.
func RunKubectl(ref ResourceReference) ([]string, error) {
	if err := ValidateResourceReference(ref); err != nil {
		return nil, err
	}

	resourceType := "cm"
	if ref.Type == ResourceTypeSecret {
		resourceType = "secret"
	}

	args := []string{"get", resourceType + "/" + ref.Name}

	if ref.Namespace != "" {
		args = append(args, "-n", ref.Namespace)
	}

	args = append(args, "-o", "json")

	output, err := exec.Command("kubectl", args...).Output() //nolint:gosec // arguments validated above

	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return nil, fmt.Errorf("kubectl command failed: %s", strings.TrimSpace(string(exitErr.Stderr)))
		}

		return nil, fmt.Errorf("kubectl command failed: %w", err)
	}

	var resourceJSON struct {
		Data map[string]any `json:"data"`
	}

	if err := json.Unmarshal(output, &resourceJSON); err != nil {
		preview := string(output)
		if len(preview) > 100 { //nolint:mnd
			preview = preview[:100] + "..."
		}

		return nil, fmt.Errorf("failed to parse kubectl output as JSON: %w (output: %s)", err, preview)
	}

	keys := make([]string, 0, len(resourceJSON.Data))

	for k := range resourceJSON.Data {
		keys = append(keys, k)
	}

	return keys, nil
}

// Sync generates a kubectl patch command that updates an existing Kubernetes
// resource with values from a local .env file, filtered to only the keys
// already present in the resource (obtained via RunKubectl).
//
// When opts.StringOnly is true, only the raw patch data string is returned
// (no kubectl command wrapper).
func Sync(opts SyncOptions) (string, error) {
	formatfx.RegisterBuiltinFormats()

	if err := ValidateResourceReference(opts.Resource); err != nil {
		return "", err
	}

	keys, err := RunKubectl(opts.Resource)
	if err != nil {
		return "", fmt.Errorf("sync: %w", err)
	}

	if len(keys) == 0 {
		return fmt.Sprintf("# No data found in %s/%s", opts.Resource.Type, opts.Resource.Name), nil
	}

	envData, err := loadEnvFile(opts.EnvFile)
	if err != nil {
		return "", err
	}

	// Filter env data to only keys present in the K8s resource.
	filtered := make(map[string]string, len(keys))

	for _, k := range keys {
		if v, ok := envData[k]; ok {
			filtered[k] = v
		}
	}

	if len(filtered) == 0 {
		return fmt.Sprintf("# No matching environment variables found for %s/%s", opts.Resource.Type, opts.Resource.Name), nil
	}

	// Secrets require Base64-encoded values in the data field.
	patchData := filtered

	if opts.Resource.Type == ResourceTypeSecret {
		patchData = make(map[string]string, len(filtered))

		for k, v := range filtered {
			patchData[k] = base64.StdEncoding.EncodeToString([]byte(v))
		}
	}

	format := opts.Format
	if format == "" {
		format = "json"
	}

	patchObject := map[string]any{"data": patchData}

	var patchString string

	switch format {
	case "yaml":
		f, fErr := formatfx.GetFormat("yaml")
		if fErr != nil {
			return "", fmt.Errorf("sync: %w", fErr)
		}

		s, wErr := f.WriteItem(patchObject, &formatfx.FormatOptions{Pretty: true}) //nolint:exhaustruct
		if wErr != nil {
			return "", fmt.Errorf("sync: %w", wErr)
		}

		patchString = strings.TrimSpace(s)

	default:
		b, mErr := json.Marshal(patchObject)
		if mErr != nil {
			return "", fmt.Errorf("sync: %w", mErr)
		}

		patchString = string(b)
	}

	if opts.StringOnly {
		return patchString, nil
	}

	return kubectlPatchCommand(opts.Resource, patchString), nil
}

// SyncApply is a convenience wrapper that validates the resource reference and
// then returns a kubectl patch command. It is equivalent to Sync with
// StringOnly=false.
func SyncApply(opts SyncOptions) (string, error) {
	if err := ValidateResourceReference(opts.Resource); err != nil {
		return "", err
	}

	return Sync(SyncOptions{
		Resource:   opts.Resource,
		EnvFile:    opts.EnvFile,
		Format:     opts.Format,
		StringOnly: false,
	})
}

// kubectlPatchCommand builds a `kubectl patch` command string.
// The resource name and namespace are validated before reaching this point so
// they are safe to embed in the command string.
func kubectlPatchCommand(ref ResourceReference, patchString string) string {
	resourceType := "cm"
	if ref.Type == ResourceTypeSecret {
		resourceType = "secret"
	}

	var sb strings.Builder

	sb.WriteString("kubectl patch ")
	sb.WriteString(resourceType)
	sb.WriteByte(' ')
	sb.WriteString(ref.Name)

	if ref.Namespace != "" {
		sb.WriteString(" -n ")
		sb.WriteString(ref.Namespace)
	}

	sb.WriteString(" --type=merge -p '")
	// Escape single-quotes for POSIX shell safety.
	sb.WriteString(strings.ReplaceAll(patchString, "'", "'\"'\"'"))
	sb.WriteByte('\'')

	return sb.String()
}
