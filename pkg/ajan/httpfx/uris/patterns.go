// This module is taken from the Go standard library and
// modified to work with the eser-go framework.

// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the go stdlib's LICENSE
// file.

package uris

import (
	"errors"
	"fmt"
	"slices"
	"strings"
)

var (
	ErrPatternParsing  = errors.New("unable to parse pattern")
	ErrInvalidWildcard = errors.New("invalid wildcard")
	ErrInvalidMethod   = errors.New("invalid method")
)

// A pattern is something that can be matched against an HTTP request.
// It has an optional method, an optional host, and a path.
type Pattern struct {
	Str    string // original string
	Method string
	Host   string
	Path   string
	Loc    string // source location of registering call, for helpful messages
	// The representation of a path differs from the surface syntax, which
	// simplifies most algorithms.
	//
	// Paths ending in '/' are represented with an anonymous "..." wildcard.
	// For example, the path "a/" is represented as a literal segment "a" followed
	// by a segment with multi==true.
	//
	// Paths ending in "{$}" are represented with the literal segment "/".
	// For example, the path "a/{$}" is represented as a literal segment "a" followed
	// by a literal segment "/".
	Segments []Segment
}

func (p *Pattern) String() string { return p.Str }

// A segment is a pattern piece that matches one or more path segments, or
// a trailing slash.
//
// If wild is false, it matches a literal segment, or, if s == "/", a trailing slash.
// Examples:
//
//	"a" => segment{s: "a"}
//	"/{$}" => segment{s: "/"}
//
// If wild is true and multi is false, it matches a single path segment.
// Example:
//
//	"{x}" => segment{s: "x", wild: true}
//
// If both wild and multi are true, it matches all remaining path segments.
// Example:
//
//	"{rest...}" => segment{s: "rest", wild: true, multi: true}
type Segment struct {
	Str   string // literal or wildcard name or "/" for "/{$}".
	Wild  bool
	Multi bool // "..." wildcard
}

func nextSegment(path string) (string, string) {
	if len(path) == 0 || path[0] != '/' {
		return "", path
	}

	path = path[1:]
	i := strings.IndexByte(path, '/')

	if i < 0 {
		return path, ""
	}

	return path[:i], path[i:]
}

// parsePattern parses a string into a Pattern.
// The string's syntax is
//
//	[METHOD] [HOST]/[PATH]
//
// where:
//   - METHOD is an HTTP method
//   - HOST is a hostname
//   - PATH consists of slash-separated segments, where each segment is either
//     a literal or a wildcard of the form "{name}", "{name...}", or "{$}".
//
// METHOD, HOST and PATH are all optional; that is, the string can be "/".
// If METHOD is present, it must be followed by a single space.
// Wildcard names must be valid Go identifiers.
// The "{$}" and "{name...}" wildcard must occur at the end of PATH.
// PATH may end with a '/'.
// Wildcard names in a path must be distinct.
func ParsePattern(s string) (*Pattern, error) { //nolint:cyclop,gocognit,funlen,varnamelen
	if len(s) == 0 {
		return nil, fmt.Errorf(
			"%w (pattern=%q)",
			ErrPatternParsing,
			s,
		)
	}

	var err error

	off := 0 // offset into string

	defer func() {
		if err != nil {
			err = fmt.Errorf("%w (at_offset=%d)", err, off)
		}
	}()

	method, rest, found := strings.Cut(s, " ")
	if !found {
		rest = method
		method = ""
	}

	if method != "" {
		validMethods := []string{"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}

		if !slices.Contains(validMethods, method) {
			return nil, fmt.Errorf(
				"%w (pattern=%q, method=%q)",
				ErrInvalidMethod,
				s,
				method,
			)
		}
	}

	p := &Pattern{Str: s, Method: method} //nolint:exhaustruct,varnamelen

	if found {
		off = len(method) + 1
	}

	i := strings.IndexByte(rest, '/')
	if i < 0 {
		return nil, fmt.Errorf(
			"%w (pattern=%q, method=%q)",
			ErrPatternParsing,
			p.Str,
			p.Method,
		)
	}

	p.Host = rest[:i]
	rest = rest[i:]

	if j := strings.IndexByte(p.Host, '{'); j >= 0 {
		off += j

		return nil, fmt.Errorf(
			"%w (pattern=%q, method=%q, host=%q)",
			ErrPatternParsing,
			p.Str,
			p.Method,
			p.Host,
		)
	}

	// At this point, rest is the path.
	off += i

	// An unclean path with a method that is not CONNECT can never match,
	// because paths are cleaned before matching.
	if method != "" && method != "CONNECT" && rest != CleanPath(rest) {
		return nil, fmt.Errorf(
			"%w (pattern=%q, reason=%q, method=%q, host=%q, path=%q)",
			ErrPatternParsing,
			p.Str,
			"host contains '{' (missing initial '/'?) - non-CONNECT pattern with unclean path can never match",
			p.Method,
			p.Host,
			rest,
		)
	}

	p.Path = rest
	seenNames := make(map[string]bool) // remember wildcard names to catch dups

	// Handle trailing slash
	if strings.HasSuffix(rest, "/") {
		rest = rest[:len(rest)-1]

		defer func() {
			if err == nil {
				p.Segments = append(
					p.Segments,
					Segment{Wild: true, Multi: true}, //nolint:exhaustruct
				)
			}
		}()
	}

	// Split the path into segments.
	for rest != "" {
		var seg string

		seg, rest = nextSegment(rest)
		if seg == "" {
			continue
		}

		// Special handling for {$}
		if seg == "{$}" {
			if rest != "" {
				return nil, fmt.Errorf(
					"%w (reason=%q, pattern=%q, method=%q)",
					ErrInvalidWildcard,
					"${} must be last",
					p.Str,
					p.Method,
				)
			}

			p.Segments = append(p.Segments, Segment{Str: "/"}) //nolint:exhaustruct

			continue
		}

		// Check for wildcards.
		if strings.HasPrefix(seg, "{") && strings.HasSuffix(seg, "}") { //nolint:nestif
			name := seg[1 : len(seg)-1]
			multi := false

			if strings.HasSuffix(name, "...") {
				if rest != "" {
					return nil, fmt.Errorf(
						"%w (reason=%q, pattern=%q, method=%q, segment=%q, name=%q)",
						ErrInvalidWildcard,
						"multi-wildcard must be last",
						p.Str,
						p.Method,
						seg,
						name,
					)
				}

				name = name[:len(name)-3]
				multi = true
			}

			if name == "" {
				return nil, fmt.Errorf(
					"%w (reason=%q, pattern=%q, method=%q, segment=%q, name=%q)",
					ErrInvalidWildcard,
					"empty wildcard",
					p.Str,
					p.Method,
					seg,
					name,
				)
			}

			if !isValidWildcardName(name) {
				return nil, fmt.Errorf(
					"%w (reason=%q, pattern=%q, method=%q, segment=%q, name=%q)",
					ErrInvalidWildcard,
					"bad wildcard name",
					p.Str,
					p.Method,
					seg,
					name,
				)
			}

			if seenNames[name] {
				return nil, fmt.Errorf(
					"%w (reason=%q, pattern=%q, method=%q, segment=%q, name=%q)",
					ErrInvalidWildcard,
					"duplicate wildcard name",
					p.Str,
					p.Method,
					seg,
					name,
				)
			}

			seenNames[name] = true
			p.Segments = append(p.Segments, Segment{Str: name, Wild: true, Multi: multi})
		} else {
			// Check for invalid wildcard positions
			if strings.Contains(seg, "}") || strings.Contains(seg, "{") {
				return nil, fmt.Errorf(
					"%w (reason=%q, pattern=%q, method=%q, segment=%q)",
					ErrInvalidWildcard,
					"invalid wildcard position",
					p.Str,
					p.Method,
					seg,
				)
			}

			p.Segments = append(p.Segments, Segment{Str: seg}) //nolint:exhaustruct
		}
	}

	return p, nil
}
