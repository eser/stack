// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package codebasefx

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
)

// The flake builds noskills from source with buildGoModule (TASK-261). Its
// vendorHash is the hash of what `go mod vendor` writes for the root module,
// so it changes with go.sum; `eser dev nix-vendor-hash` computes it with Go,
// without Nix, and writes or checks the value in flake.nix.

const goVendorTimeout = 5 * time.Minute

var (
	// ErrNoVendorHash is returned when flake.nix has no vendorHash line.
	ErrNoVendorHash = errors.New(`flake.nix has no vendorHash = "sha256-..."; line`)
	// ErrVendorHashStale is returned when flake.nix's vendorHash is not the
	// hash of the current go.sum.
	ErrVendorHashStale = errors.New("the vendorHash in flake.nix does not match go.sum")

	vendorHashPattern = regexp.MustCompile(`(vendorHash = ")(sha256-[A-Za-z0-9+/=]+)(";)`)
)

// GoVendorHash runs `go mod vendor` for the module at root into a temporary
// directory and returns the SRI SHA-256 of its NAR serialization: the
// vendorHash buildGoModule checks. go.mod's tool dependencies are vendored
// too, as buildGoModule's own `go mod vendor` does.
func GoVendorHash(ctx context.Context, root string) (string, error) {
	out, err := os.MkdirTemp("", "eser-go-vendor-")
	if err != nil {
		return "", fmt.Errorf("create the vendor directory: %w", err)
	}

	defer func() { _ = os.RemoveAll(out) }()

	vendor := filepath.Join(out, "vendor")

	ctx, cancel := context.WithTimeout(ctx, goVendorTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "go", "mod", "vendor", "-o", vendor)
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "GOFLAGS=-mod=mod", "GOWORK=off")

	if output, err := cmd.CombinedOutput(); err != nil {
		if ctx.Err() != nil {
			return "", fmt.Errorf("go mod vendor did not finish within %s; check that the module proxy is reachable", goVendorTimeout) //nolint:err113
		}

		return "", fmt.Errorf("go mod vendor in %s: %w\n%s", root, err, strings.TrimSpace(string(output)))
	}

	return NarHash(vendor)
}

// NarHash is the SRI SHA-256 of a path's NAR serialization, the hash Nix
// gives a fixed-output derivation: sha256-<base64>.
func NarHash(path string) (string, error) {
	h := sha256.New()
	w := &narWriter{h: h}

	w.str("nix-archive-1")

	if err := w.node(path); err != nil {
		return "", err
	}

	return "sha256-" + base64.StdEncoding.EncodeToString(h.Sum(nil)), nil
}

type narWriter struct {
	h hash.Hash
}

// str writes a NAR string: its length as a little-endian uint64, the bytes,
// and zero padding to a multiple of eight.
func (w *narWriter) str(s string) {
	w.length(uint64(len(s)))
	_, _ = io.WriteString(w.h, s)
	w.pad(uint64(len(s)))
}

func (w *narWriter) length(n uint64) {
	var b [8]byte
	binary.LittleEndian.PutUint64(b[:], n)
	_, _ = w.h.Write(b[:])
}

func (w *narWriter) pad(n uint64) {
	if rest := n % 8; rest != 0 { //nolint:mnd // NAR aligns to eight bytes
		_, _ = w.h.Write(make([]byte, 8-rest))
	}
}

func (w *narWriter) node(path string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("nar %s: %w", path, err)
	}

	w.str("(")
	w.str("type")

	switch mode := info.Mode(); {
	case mode&os.ModeSymlink != 0:
		target, err := os.Readlink(path)
		if err != nil {
			return fmt.Errorf("nar %s: %w", path, err)
		}

		w.str("symlink")
		w.str("target")
		w.str(target)
	case mode.IsDir():
		if err := w.directory(path); err != nil {
			return err
		}
	case mode.IsRegular():
		if err := w.regular(path, info); err != nil {
			return err
		}
	default:
		return fmt.Errorf("nar %s: %s is neither a file, a directory nor a symlink", path, mode) //nolint:err113
	}

	w.str(")")

	return nil
}

func (w *narWriter) directory(path string) error {
	entries, err := os.ReadDir(path)
	if err != nil {
		return fmt.Errorf("nar %s: %w", path, err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}

	// NAR orders entries by their bytes, which is Go's string order.
	slices.Sort(names)

	w.str("directory")

	for _, name := range names {
		w.str("entry")
		w.str("(")
		w.str("name")
		w.str(name)
		w.str("node")

		if err := w.node(filepath.Join(path, name)); err != nil {
			return err
		}

		w.str(")")
	}

	return nil
}

func (w *narWriter) regular(path string, info os.FileInfo) error {
	w.str("regular")

	if info.Mode().Perm()&0o100 != 0 {
		w.str("executable")
		w.str("")
	}

	w.str("contents")

	file, err := os.Open(path) //nolint:gosec // G304: a file of the tree being hashed
	if err != nil {
		return fmt.Errorf("nar %s: %w", path, err)
	}

	defer func() { _ = file.Close() }()

	size := uint64(info.Size()) //nolint:gosec // G115: a file size is not negative
	w.length(size)

	copied, err := io.Copy(w.h, file)
	if err != nil {
		return fmt.Errorf("nar %s: %w", path, err)
	}

	if uint64(copied) != size { //nolint:gosec // G115: a byte count is not negative
		return fmt.Errorf("nar %s: changed while it was read", path) //nolint:err113
	}

	w.pad(size)

	return nil
}

// FlakeVendorHash is the vendorHash flake.nix gives the noskills package.
func FlakeVendorHash(flake string) (string, error) {
	match := vendorHashPattern.FindStringSubmatch(flake)
	if match == nil {
		return "", ErrNoVendorHash
	}

	return match[2], nil
}

// SetFlakeVendorHash returns flake.nix with its vendorHash replaced.
func SetFlakeVendorHash(flake, vendorHash string) (string, error) {
	if !vendorHashPattern.MatchString(flake) {
		return "", ErrNoVendorHash
	}

	return vendorHashPattern.ReplaceAllString(flake, "${1}"+vendorHash+"${3}"), nil
}
