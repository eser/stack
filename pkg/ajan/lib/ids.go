package lib

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/oklog/ulid/v2"
)

func IDsGenerateUnique() string {
	// return ulid.MustNew(ulid.Now(), nil).String()
	return ulid.Make().String()
}

func GenerateHexID(byteLength int) string {
	bytes := make([]byte, byteLength)
	rand.Read(bytes) //nolint:errcheck,gosec // rand.Read should not fail in practice

	return hex.EncodeToString(bytes)
}

func GenerateTraceID() string {
	return GenerateHexID(16) //nolint:mnd // 128-bit
}

func GenerateSpanID() string {
	return GenerateHexID(8) //nolint:mnd // 64-bit
}
