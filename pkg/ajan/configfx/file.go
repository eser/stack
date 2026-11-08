// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package configfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/eser/stack/pkg/ajan/configfx/internal/textfile"
	"github.com/eser/stack/pkg/ajan/configfx/jsonparser"
)

// The file loader of @eserstack/config/file: it finds a configuration file
// in a directory hierarchy, picks its format from the extension and parses
// it. The TypeScript library reaches these functions through the bridge.

// FileFormat is a configuration file format, numbered as the FileFormats of
// @eserstack/config/file number them.
type FileFormat int

const (
	FileFormatUnknown          FileFormat = 0
	FileFormatEnvironment      FileFormat = 1
	FileFormatJSON             FileFormat = 2
	FileFormatJSONWithComments FileFormat = 3
	FileFormatTOML             FileFormat = 4
	FileFormatYAML             FileFormat = 5
)

// PathStyle says which separators a path uses, as Node's path.posix and
// path.win32 read them.
type PathStyle int

const (
	// PathStyleUnknown reads paths the way this build's own system does.
	PathStyleUnknown PathStyle = iota
	// PathStylePOSIX separates with "/" only.
	PathStylePOSIX
	// PathStyleWindows separates with "/" and "\", after an optional drive
	// letter.
	PathStyleWindows
)

// ErrFileParse is the error a ParseFile failure to parse matches; a failure
// to read the file returns the os error instead.
var ErrFileParse = errors.New("failed to parse configuration file")

// FileParseError reports a file that does not parse in its format.
type FileParseError struct {
	Err    error
	Format FileFormat
}

func (e *FileParseError) Error() string {
	return e.Err.Error()
}

// Unwrap gives the parser's error.
func (e *FileParseError) Unwrap() error {
	return e.Err
}

// Is makes errors.Is(err, ErrFileParse) hold.
func (e *FileParseError) Is(target error) bool {
	return target == ErrFileParse
}

// FileFormatOf picks the format from the extension of path, as Node's
// path.extname finds it: ".json", ".jsonc", ".yaml" or ".yml", ".toml" and
// ".env". A name that only starts with a dot, such as ".env", has no
// extension.
func FileFormatOf(path string, style PathStyle) FileFormat {
	switch extname(path, style) {
	case ".json":
		return FileFormatJSON
	case ".jsonc":
		return FileFormatJSONWithComments
	case ".yaml", ".yml":
		return FileFormatYAML
	case ".toml":
		return FileFormatTOML
	case ".env":
		return FileFormatEnvironment
	default:
		return FileFormatUnknown
	}
}

func resolveStyle(style PathStyle) PathStyle {
	if style != PathStyleUnknown {
		return style
	}

	if runtime.GOOS == "windows" {
		return PathStyleWindows
	}

	return PathStylePOSIX
}

// extname is Node's path.extname, posix or win32 by style.
func extname(path string, style PathStyle) string { //nolint:cyclop // a port of Node's loop
	windows := resolveStyle(style) == PathStyleWindows
	isSeparator := func(c byte) bool {
		return c == '/' || (windows && c == '\\')
	}

	start, startPart := 0, 0
	if windows && len(path) >= 2 && path[1] == ':' && isASCIILetter(path[0]) {
		start, startPart = 2, 2
	}

	startDot, end, preDotState := -1, -1, 0
	matchedSlash := true

	for i := len(path) - 1; i >= start; i-- {
		c := path[i]
		if isSeparator(c) {
			if !matchedSlash {
				startPart = i + 1

				break
			}

			continue
		}

		if end == -1 {
			matchedSlash = false
			end = i + 1
		}

		switch {
		case c == '.' && startDot == -1:
			startDot = i
		case c == '.' && preDotState != 1:
			preDotState = 1
		case c != '.' && startDot != -1:
			preDotState = -1
		}
	}

	if startDot == -1 || end == -1 || preDotState == 0 ||
		(preDotState == 1 && startDot == end-1 && startDot == startPart+1) {
		return ""
	}

	return path[startDot:end]
}

func isASCIILetter(c byte) bool {
	return ('a' <= c && c <= 'z') || ('A' <= c && c <= 'Z')
}

// LocateOptions are the options of LocateFile.
type LocateOptions struct {
	// SearchParents searches the parent directories of baseDir too, up to
	// the root.
	SearchParents bool
}

// LocateFile returns the path of the first of filenames that is a file
// (directories do not count) in baseDir and, with SearchParents, in each of
// its parent directories, nearest first. Paths are joined as filepath.Join
// joins them, and parents are taken as Node's path.dirname takes them, so a
// relative baseDir stops at ".".
func LocateFile(baseDir string, filenames []string, opts LocateOptions) (string, bool) {
	dir := baseDir

	for {
		for _, name := range filenames {
			candidate := filepath.Join(dir, name)
			if isRegularFile(candidate) {
				return candidate, true
			}
		}

		if !opts.SearchParents {
			return "", false
		}

		parent := dirname(dir)
		if parent == dir {
			return "", false
		}

		dir = parent
	}
}

func isRegularFile(path string) bool {
	info, err := os.Stat(filepath.Clean(path))

	return err == nil && info.Mode().IsRegular()
}

// dirname is Node's path.posix.dirname, which leaves "." and ".." segments
// as they are, on systems that separate with "/" only; Windows uses
// filepath.Dir after the trailing separators.
func dirname(path string) string {
	if runtime.GOOS == "windows" {
		trimmed := strings.TrimRight(path, `/\`)
		if trimmed == "" || strings.HasSuffix(trimmed, ":") {
			return filepath.Dir(path)
		}

		return filepath.Dir(trimmed)
	}

	if path == "" {
		return "."
	}

	hasRoot := path[0] == '/'
	end := -1
	matchedSlash := true

	for i := len(path) - 1; i >= 1; i-- {
		if path[i] == '/' {
			if !matchedSlash {
				end = i

				break
			}
		} else {
			matchedSlash = false
		}
	}

	switch {
	case end == -1 && hasRoot:
		return "/"
	case end == -1:
		return "."
	case hasRoot && end == 1:
		return "//"
	default:
		return path[:end]
	}
}

// ParseFileOptions are the options of ParseFile.
type ParseFileOptions struct {
	// Format overrides the format; nil picks it from the extension.
	Format *FileFormat
	// PathStyle is how the extension is found when Format is nil.
	PathStyle PathStyle
}

// ParsedFile is what ParseFile read.
type ParsedFile struct {
	// Content is the JSON or JSONC document as standard JSON, keys in the
	// order of the file; nil for the other formats.
	Content json.RawMessage
	// Text is the file as written, for YAML and TOML, which the caller
	// decodes; empty for the other formats.
	Text string
	// Format is the format the file was read as; FileFormatUnknown for an
	// environment file and any format without a parser here.
	Format FileFormat
}

// ParseFile reads the file at path as text, as Node reads it (invalid UTF-8
// becomes U+FFFD, a byte order mark stays), and parses it in its format. A
// read failure returns the os error, so errors.Is matches fs.ErrNotExist and
// fs.ErrPermission; a parse failure returns a *FileParseError.
func ParseFile(path string, opts ParseFileOptions) (ParsedFile, error) {
	format := FileFormatOf(path, opts.PathStyle)
	if opts.Format != nil {
		format = *opts.Format
	}

	data, _, err := textfile.ReadLimited(path, -1)
	if err != nil {
		return ParsedFile{}, fmt.Errorf("read configuration file %q: %w", path, err)
	}

	text := textfile.Decode(data)

	switch format {
	case FileFormatJSON:
		content, err := jsonparser.Document(text)
		if err != nil {
			return ParsedFile{}, &FileParseError{Err: err, Format: format}
		}

		return ParsedFile{Content: content, Text: "", Format: format}, nil
	case FileFormatJSONWithComments:
		content, err := jsonparser.DocumentWithComments(text)
		if err != nil {
			return ParsedFile{}, &FileParseError{Err: err, Format: format}
		}

		return ParsedFile{Content: content, Text: "", Format: format}, nil
	case FileFormatTOML, FileFormatYAML:
		return ParsedFile{Content: nil, Text: text, Format: format}, nil
	default:
		return ParsedFile{Content: nil, Text: "", Format: FileFormatUnknown}, nil
	}
}
