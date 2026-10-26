// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx_test

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// rawTarEntry builds one ustar header block and its padded content with any
// typeflag, so a test can write entries tar.Writer refuses or rewrites (a V7
// NUL typeflag, a pax global header).
func rawTarEntry(name string, typeflag byte, content string) []byte {
	blocks := 1 + (len(content)+511)/512
	entry := make([]byte, 512*blocks)
	header := entry[:512]

	copy(header[0:], name)
	copy(header[100:], "0000644\x00")
	copy(header[108:], "0000000\x00")
	copy(header[116:], "0000000\x00")
	copy(header[124:], fmt.Sprintf("%011o\x00", len(content)))
	copy(header[136:], "00000000000\x00")
	copy(header[148:], "        ")
	header[156] = typeflag
	copy(header[257:], "ustar\x0000")

	sum := 0
	for _, b := range header {
		sum += int(b)
	}

	copy(header[148:], fmt.Sprintf("%06o\x00 ", sum))
	copy(entry[512:], content)

	return entry
}

// plainTar builds an uncompressed tar of regular files, end blocks included.
func plainTar(t *testing.T, files ...[2]string) []byte {
	t.Helper()

	var buf bytes.Buffer

	tw := tar.NewWriter(&buf)

	for _, file := range files {
		header := &tar.Header{Name: file[0], Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(file[1]))} //nolint:exhaustruct

		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}

		if _, err := tw.Write([]byte(file[1])); err != nil {
			t.Fatal(err)
		}
	}

	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}

	return buf.Bytes()
}

func gzipBytes(t *testing.T, parts ...[]byte) []byte {
	t.Helper()

	var buf bytes.Buffer

	gz := gzip.NewWriter(&buf)

	for _, part := range parts {
		if _, err := gz.Write(part); err != nil {
			t.Fatal(err)
		}
	}

	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}

	return buf.Bytes()
}

// extractedFiles lists the regular files under dir, slash-separated and
// sorted.
func extractedFiles(t *testing.T, dir string) []string {
	t.Helper()

	var files []string

	err := filepath.WalkDir(dir, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if !entry.IsDir() {
			rel, relErr := filepath.Rel(dir, path)
			if relErr != nil {
				return relErr
			}

			files = append(files, filepath.ToSlash(rel))
		}

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	slices.Sort(files)

	return files
}

func TestExtractTarballLimits(t *testing.T) {
	t.Parallel()

	threeFiles := plainTar(t, [2]string{"a.txt", "a\n"}, [2]string{"b.txt", "b\n"}, [2]string{"c.txt", "c\n"})

	t.Run("an entry cut off by maxBytes leaves no partial file", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		bomb := gzipBytes(t, plainTar(t, [2]string{"bomb.bin", strings.Repeat("\x00", 1<<20)}))

		err := kitfx.ExtractTarball(bytes.NewReader(bomb), dir, kitfx.ExtractOptions{MaxBytes: 64 << 10}) //nolint:exhaustruct

		limitErr, ok := errors.AsType[*kitfx.TarballLimitError](err)
		if !ok || limitErr.Limit != kitfx.LimitMaxBytes || limitErr.Max != 64<<10 {
			t.Fatalf("want a maxBytes TarballLimitError, got %v", err)
		}

		if !strings.Contains(err.Error(), "decompressed size exceeds maxBytes (65536 bytes)") {
			t.Errorf("message: %q", err.Error())
		}

		if files := extractedFiles(t, dir); len(files) != 0 {
			t.Errorf("extracted %v, want nothing", files)
		}
	})

	t.Run("an archive of exactly maxBytes extracts", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()

		err := kitfx.ExtractTarball(bytes.NewReader(gzipBytes(t, threeFiles)), dir, kitfx.ExtractOptions{MaxBytes: int64(len(threeFiles))}) //nolint:exhaustruct
		if err != nil {
			t.Fatal(err)
		}

		if files := extractedFiles(t, dir); !slices.Equal(files, []string{"a.txt", "b.txt", "c.txt"}) {
			t.Errorf("extracted %v", files)
		}
	})

	t.Run("one byte under the archive size fails", func(t *testing.T) {
		t.Parallel()

		err := kitfx.ExtractTarball(bytes.NewReader(gzipBytes(t, threeFiles)), t.TempDir(), kitfx.ExtractOptions{MaxBytes: int64(len(threeFiles) - 1)}) //nolint:exhaustruct
		if _, ok := errors.AsType[*kitfx.TarballLimitError](err); !ok {
			t.Fatalf("want a TarballLimitError, got %v", err)
		}
	})

	t.Run("maxEntries stops before the entry past it", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()

		err := kitfx.ExtractTarball(bytes.NewReader(gzipBytes(t, threeFiles)), dir, kitfx.ExtractOptions{MaxEntries: 2}) //nolint:exhaustruct

		limitErr, ok := errors.AsType[*kitfx.TarballLimitError](err)
		if !ok || limitErr.Limit != kitfx.LimitMaxEntries || limitErr.Max != 2 {
			t.Fatalf("want a maxEntries TarballLimitError, got %v", err)
		}

		if files := extractedFiles(t, dir); !slices.Equal(files, []string{"a.txt", "b.txt"}) {
			t.Errorf("extracted %v, want a.txt and b.txt", files)
		}
	})

	t.Run("entries that subpath leaves out count", func(t *testing.T) {
		t.Parallel()

		archive := gzipBytes(t, plainTar(t,
			[2]string{"repo-main/other/x.txt", "x"},
			[2]string{"repo-main/other/y.txt", "y"},
			[2]string{"repo-main/wanted/z.txt", "z"},
		))

		err := kitfx.ExtractTarball(bytes.NewReader(archive), t.TempDir(), kitfx.ExtractOptions{StripComponents: 1, Subpath: "wanted", MaxEntries: 2}) //nolint:exhaustruct
		if _, ok := errors.AsType[*kitfx.TarballLimitError](err); !ok {
			t.Fatalf("want a TarballLimitError, got %v", err)
		}
	})

	t.Run("an archive of exactly maxEntries extracts", func(t *testing.T) {
		t.Parallel()

		err := kitfx.ExtractTarball(bytes.NewReader(gzipBytes(t, threeFiles)), t.TempDir(), kitfx.ExtractOptions{MaxEntries: 3}) //nolint:exhaustruct
		if err != nil {
			t.Fatal(err)
		}
	})
}

func TestExtractTarballEntries(t *testing.T) {
	t.Parallel()

	t.Run("regular files of every typeflag are written, metadata is not", func(t *testing.T) {
		t.Parallel()

		dir := t.TempDir()
		archive := gzipBytes(t,
			rawTarEntry("pax_global_header", 'g', "20 comment=0123abcd\n"),
			rawTarEntry("v7.txt", 0, "v7\n"),
			rawTarEntry("contiguous.txt", '7', "contiguous\n"),
			rawTarEntry("dir/", '5', ""),
			rawTarEntry("fifo", '6', ""),
			plainTar(t, [2]string{"real.txt", "real\n"}),
		)

		if err := kitfx.ExtractTarball(bytes.NewReader(archive), dir, kitfx.ExtractOptions{}); err != nil { //nolint:exhaustruct
			t.Fatal(err)
		}

		want := []string{"contiguous.txt", "real.txt", "v7.txt"}
		if files := extractedFiles(t, dir); !slices.Equal(files, want) {
			t.Errorf("extracted %v, want %v", files, want)
		}

		content, err := os.ReadFile(filepath.Join(dir, "v7.txt")) //nolint:gosec // the test's own output
		if err != nil || string(content) != "v7\n" {
			t.Errorf("v7.txt holds %q (%v)", content, err)
		}
	})

	t.Run("entries that escape the target are dropped", func(t *testing.T) {
		t.Parallel()

		root := t.TempDir()
		target := filepath.Join(root, "nested", "target")
		archive := gzipBytes(t, plainTar(t,
			[2]string{"../../etc/passwd", "root:x:0:0\n"},
			[2]string{"/abs/escape.txt", "escape\n"},
			[2]string{"ok.txt", "ok\n"},
		))

		if err := kitfx.ExtractTarball(bytes.NewReader(archive), target, kitfx.ExtractOptions{}); err != nil { //nolint:exhaustruct
			t.Fatal(err)
		}

		if files := extractedFiles(t, root); !slices.Equal(files, []string{"nested/target/ok.txt"}) {
			t.Errorf("extracted %v", files)
		}
	})

	for _, subpath := range []string{"include", "/include/"} {
		t.Run("subpath "+subpath+" keeps only its files", func(t *testing.T) {
			t.Parallel()

			dir := t.TempDir()
			archive := gzipBytes(t, plainTar(t,
				[2]string{"repo-main/include/wanted.txt", "wanted\n"},
				[2]string{"repo-main/exclude/unwanted.txt", "unwanted\n"},
				[2]string{"repo-main/include-extra/sibling.txt", "sibling\n"},
			))

			if err := kitfx.ExtractTarball(bytes.NewReader(archive), dir, kitfx.ExtractOptions{StripComponents: 1, Subpath: subpath}); err != nil { //nolint:exhaustruct
				t.Fatal(err)
			}

			if files := extractedFiles(t, dir); !slices.Equal(files, []string{"wanted.txt"}) {
				t.Errorf("extracted %v", files)
			}
		})
	}

	for _, subpath := range []string{"", "/", "."} {
		t.Run("root subpath "+subpath+" keeps everything", func(t *testing.T) {
			t.Parallel()

			dir := t.TempDir()
			archive := gzipBytes(t, plainTar(t,
				[2]string{"repo-main/.github/ci.yml", "ci\n"},
				[2]string{"repo-main/src/mod.ts", "mod\n"},
			))

			if err := kitfx.ExtractTarball(bytes.NewReader(archive), dir, kitfx.ExtractOptions{StripComponents: 1, Subpath: subpath}); err != nil { //nolint:exhaustruct
				t.Fatal(err)
			}

			if files := extractedFiles(t, dir); !slices.Equal(files, []string{".github/ci.yml", "src/mod.ts"}) {
				t.Errorf("extracted %v", files)
			}
		})
	}
}

func TestExtractTarballRefusesInvalidOptions(t *testing.T) {
	t.Parallel()

	archive := gzipBytes(t, plainTar(t, [2]string{"repo-main/a.txt", "a\n"}))

	for _, opts := range []kitfx.ExtractOptions{
		{StripComponents: -1}, //nolint:exhaustruct
		{MaxBytes: -1},        //nolint:exhaustruct
		{MaxEntries: -1},      //nolint:exhaustruct
	} {
		dir := t.TempDir()
		if err := kitfx.ExtractTarball(bytes.NewReader(archive), dir, opts); err == nil {
			t.Errorf("%+v: want an error", opts)
		}

		if files := extractedFiles(t, dir); len(files) != 0 {
			t.Errorf("%+v: extracted %v", opts, files)
		}
	}
}
