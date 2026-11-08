// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package envparser

import (
	"errors"
	"fmt"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/eser/stack/pkg/ajan/configfx/internal/textfile"
)

// DefaultDotenvMaxFileSize is the size limit of a .env file that
// @eserstack/config/dotenv applies when the caller gives none: 1 MiB.
const DefaultDotenvMaxFileSize = 1024 * 1024

// ErrFileTooLarge is the error FileTooLargeError matches.
var ErrFileTooLarge = errors.New("environment file is too large")

// FileTooLargeError reports a .env file over the size limit.
type FileTooLargeError struct {
	Path    string
	Size    int64
	MaxSize float64
}

func (e *FileTooLargeError) Error() string {
	return fmt.Sprintf("environment file %q is too large (%d bytes), the limit is %v bytes", e.Path, e.Size, e.MaxSize)
}

// Is makes errors.Is(err, ErrFileTooLarge) hold.
func (e *FileTooLargeError) Is(target error) bool {
	return target == ErrFileTooLarge
}

// ReadDotenvFile reads and parses the .env file at path with ParseDotenv. A
// file that does not exist reads as empty; a file larger than maxSize bytes
// is refused with a *FileTooLargeError before it is read (+Inf or NaN set no
// limit). A leading byte order mark is dropped, and invalid UTF-8 reads as
// U+FFFD, as TextDecoder reads it.
func ReadDotenvFile(path string, maxSize float64, lookup LookupFunc) (DotenvResult, error) {
	info, err := os.Stat(filepath.Clean(path))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return DotenvResult{}, nil
		}

		return DotenvResult{}, fmt.Errorf("stat %q: %w", path, err)
	}

	if float64(info.Size()) > maxSize {
		return DotenvResult{}, &FileTooLargeError{Path: path, Size: info.Size(), MaxSize: maxSize}
	}

	limit := readLimit(maxSize)

	data, exceeded, err := textfile.ReadLimited(path, limit)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return DotenvResult{}, nil
		}

		return DotenvResult{}, fmt.Errorf("read %q: %w", path, err)
	}

	if exceeded {
		// The file grew between the stat and the read.
		return DotenvResult{}, &FileTooLargeError{Path: path, Size: limit + 1, MaxSize: maxSize}
	}

	text := strings.TrimPrefix(textfile.Decode(data), textfile.ByteOrderMark)

	return ParseDotenv(text, lookup), nil
}

// readLimit turns a size limit into the most bytes worth reading, or -1 for
// no limit.
func readLimit(maxSize float64) int64 {
	if math.IsNaN(maxSize) || maxSize >= math.MaxInt64 {
		return -1
	}

	return int64(math.Floor(maxSize))
}

// DotenvLoadOptions are the inputs of LoadDotenv. The host's environment
// comes in as data, because the WASM build of the bridge has none of its own.
type DotenvLoadOptions struct {
	// Env is the environment name; nil reads it from EnvVars.
	Env *string
	// Lookup resolves the names a file refers to and does not set; nil
	// resolves none.
	Lookup LookupFunc
	// BaseDir is the directory of the files; the paths are BaseDir + "/.env"
	// and so on, joined as text.
	BaseDir string
	// DefaultEnv is the environment name when no EnvVars variable is set.
	DefaultEnv string
	// EnvVars are the variables read for the environment name, in order.
	EnvVars []string
	// Environ is the process environment, in its own order.
	Environ []DotenvEntry
	// MaxFileSize is the size limit of each file in bytes; +Inf sets none.
	MaxFileSize float64
	// LoadProcessEnv makes Environ override the files.
	LoadProcessEnv bool
}

// DotenvLoadResult is what LoadDotenv loaded.
type DotenvLoadResult struct {
	// EnvName is the environment name the files were picked by.
	EnvName string
	// Entries are the variables, each at the position where its key was
	// first loaded.
	Entries []DotenvEntry
	// Ignored are the keys the files skipped as not identifiers.
	Ignored []string
}

// LoadDotenv loads .env, .env.<name>, .env.local (except for the name
// "test"), .env.<name>.local and then, with LoadProcessEnv, the process
// environment, each overriding the ones before. The name is Env, else the
// value of the first EnvVars variable that is set and not empty, else
// DefaultEnv. On an error the result holds the keys ignored so far.
func LoadDotenv(opts *DotenvLoadOptions) (DotenvLoadResult, error) {
	envName := envNameFrom(opts.Environ, opts.EnvVars, opts.DefaultEnv)
	if opts.Env != nil {
		envName = *opts.Env
	}

	result := DotenvLoadResult{EnvName: envName, Entries: nil, Ignored: nil}
	values := newOrderedValues()

	files := []string{".env", ".env." + envName}
	if envName != "test" {
		files = append(files, ".env.local")
	}

	files = append(files, ".env."+envName+".local")

	for _, name := range files {
		read, err := ReadDotenvFile(opts.BaseDir+"/"+name, opts.MaxFileSize, opts.Lookup)
		result.Ignored = append(result.Ignored, read.Ignored...)

		if err != nil {
			return result, err
		}

		for _, entry := range read.Entries {
			values.set(entry.Key, entry.Value)
		}
	}

	if opts.LoadProcessEnv {
		for _, entry := range opts.Environ {
			values.set(entry.Key, entry.Value)
		}
	}

	result.Entries = values.entries

	return result, nil
}

// envNameFrom is the value of the first of envVars that environ sets to a
// non-empty value, else defaultEnv.
func envNameFrom(environ []DotenvEntry, envVars []string, defaultEnv string) string {
	for _, name := range envVars {
		for _, entry := range environ {
			if entry.Key == name && entry.Value != "" {
				return entry.Value
			}
		}
	}

	return defaultEnv
}

// EnvironLookup resolves names against environ. With caseInsensitive, a name
// without an exact match matches regardless of case, as Windows reads its
// environment.
func EnvironLookup(environ []DotenvEntry, caseInsensitive bool) LookupFunc {
	exact := make(map[string]string, len(environ))
	for _, entry := range environ {
		exact[entry.Key] = entry.Value
	}

	return func(name string) (string, bool) {
		if value, ok := exact[name]; ok {
			return value, true
		}

		if !caseInsensitive {
			return "", false
		}

		for _, entry := range environ {
			if strings.EqualFold(entry.Key, name) {
				return entry.Value, true
			}
		}

		return "", false
	}
}
