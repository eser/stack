// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx

import (
	"fmt"

	"github.com/eser/stack/pkg/ajan/formatfx"
)

// Generate reads env data from opts.EnvFile, builds a Kubernetes ConfigMap or
// Secret resource, and serializes it to YAML (default) or JSON.
//
// When no env data is found the function returns a comment string rather than
// an error, matching the TypeScript @eserstack/cs behaviour.
func Generate(opts GenerateOptions) (string, error) {
	formatfx.RegisterBuiltinFormats()

	var data map[string]string
	var err error

	if len(opts.EnvFiles) > 0 {
		data = make(map[string]string)
		for _, f := range opts.EnvFiles {
			fileData, ferr := loadEnvFile(f)
			if ferr != nil {
				return "", ferr
			}
			for k, v := range fileData {
				data[k] = v
			}
		}
	} else {
		data, err = loadEnvFile(opts.EnvFile)
		if err != nil {
			return "", err
		}
	}

	if len(data) == 0 {
		return fmt.Sprintf("# No environment data found to generate %s/%s", opts.Resource.Type, opts.Resource.Name), nil
	}

	// Resolve namespace: resource-level wins over top-level fallback.
	ns := opts.Resource.Namespace
	if ns == "" {
		ns = opts.Namespace
	}

	var resource any

	switch opts.Resource.Type {
	case ResourceTypeSecret:
		resource = BuildSecret(opts.Resource.Name, ns, data)
	default:
		resource = BuildConfigMap(opts.Resource.Name, ns, data)
	}

	format := opts.Format
	if format == "" {
		format = "yaml"
	}

	f, err := formatfx.GetFormat(format)
	if err != nil {
		return "", fmt.Errorf("generate: %w", err)
	}

	// Use WriteStart + WriteItem(IsFirst:true) + WriteEnd so JSON output is an
	// array ("[{...}]") matching formats.serialize([resource]) on the TS side.
	// YAML is unaffected: WriteStart/End return "" and WriteItem ignores IsFirst.
	fmtOpts := &formatfx.FormatOptions{Pretty: true, IsFirst: true} //nolint:exhaustruct
	start, err := f.WriteStart(fmtOpts)
	if err != nil {
		return "", fmt.Errorf("generate: WriteStart: %w", err)
	}

	item, err := f.WriteItem(resource, fmtOpts)
	if err != nil {
		return "", fmt.Errorf("generate: WriteItem: %w", err)
	}

	end, err := f.WriteEnd(fmtOpts)
	if err != nil {
		return "", fmt.Errorf("generate: WriteEnd: %w", err)
	}

	return start + item + end, nil
}
