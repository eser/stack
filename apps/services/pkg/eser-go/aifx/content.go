package aifx

import (
	"encoding/base64"
	"fmt"
	"path"
	"strings"
)

// ImageDetail controls image processing detail level.
type ImageDetail string

const (
	ImageDetailLow  ImageDetail = "low"
	ImageDetailHigh ImageDetail = "high"
	ImageDetailAuto ImageDetail = "auto"
)

// ImagePart represents an image input (inline base64 or URL).
type ImagePart struct {
	URL      string      // HTTP URL or data: URI
	MIMEType string      // e.g. "image/jpeg", "image/png"
	Detail   ImageDetail // "low", "high", "auto"
	Data     []byte      // raw bytes (resolved from URL if needed)
}

// AudioPart represents an audio input.
type AudioPart struct {
	URL      string // HTTP URL or data: URI
	MIMEType string // e.g. "audio/mp3", "audio/wav"
	Data     []byte // raw bytes
}

// FilePart represents a file reference (used by Gemini/Vertex file URIs).
type FilePart struct {
	URI      string // e.g. "gs://bucket/path" or provider file ID
	MIMEType string
}

// IsDataURL checks if a URL is a data: URI.
func IsDataURL(url string) bool {
	return strings.HasPrefix(url, "data:")
}

// DecodeDataURL decodes a data: URI and returns MIME type and raw bytes.
func DecodeDataURL(dataURL string) (string, []byte, error) {
	// Format: data:[<mediatype>][;base64],<data>
	rest := strings.TrimPrefix(dataURL, "data:")

	meta, encoded, found := strings.Cut(rest, ",")
	if !found {
		return "", nil, ErrInvalidDataURL
	}

	isBase64 := strings.HasSuffix(meta, ";base64")
	if isBase64 {
		meta = strings.TrimSuffix(meta, ";base64")
	}

	mimeType := meta
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	if isBase64 {
		data, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			return "", nil, fmt.Errorf("decode base64 data URL: %w", err)
		}

		return mimeType, data, nil
	}

	return mimeType, []byte(encoded), nil
}

// DetectMIMEFromURL guesses MIME type from a URL's file extension.
func DetectMIMEFromURL(url string) string {
	ext := strings.ToLower(path.Ext(url))

	mimeTypes := map[string]string{
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".png":  "image/png",
		".gif":  "image/gif",
		".webp": "image/webp",
		".svg":  "image/svg+xml",
		".mp3":  "audio/mpeg",
		".wav":  "audio/wav",
		".ogg":  "audio/ogg",
		".flac": "audio/flac",
		".mp4":  "video/mp4",
		".webm": "video/webm",
		".pdf":  "application/pdf",
	}

	if mime, ok := mimeTypes[ext]; ok {
		return mime
	}

	return "application/octet-stream"
}
