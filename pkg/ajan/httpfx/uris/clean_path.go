// This module is taken from the Go standard library and
// modified to work with the eser-go framework.

// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the go stdlib's LICENSE
// file.

package uris

import (
	"path"
	"strings"
)

// CleanPath returns the canonical path for p, eliminating . and .. elements.
func CleanPath(p string) string { //nolint:varnamelen
	if p == "" {
		return "/"
	}

	if p[0] != '/' {
		p = "/" + p
	}

	np := path.Clean(p) //nolint:varnamelen
	// path.Clean removes trailing slash except for root;
	// put the trailing slash back if necessary.
	if p[len(p)-1] == '/' && np != "/" {
		// Fast path for common case of p being the string we want:
		if len(p) == len(np)+1 && strings.HasPrefix(p, np) {
			return p
		}

		return np + "/"
	}

	return np
}
