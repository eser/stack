# 🌐 [ajan/lib/netlib](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/lib/netlib`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`netlib` holds the helpers of [ajan/lib](../README.md) that need the network,
TLS or SQL packages of the standard library: host/port splitting, local and
private address checks, outbound URL validation against SSRF, self-signed
certificates, random bytes, and a nullable SQL string with JSON support. They
live apart from `lib` so that `lib`, which configfx and the WASM build of the
bridge use, does not link `net`, `crypto/tls`, `crypto/x509` and `database/sql`.

```go
package main

import (
	"fmt"

	"github.com/eser/stack/pkg/ajan/lib/netlib"
)

func main() {
	err := netlib.ValidateExternalURL("http://127.0.0.1/admin", false)
	fmt.Println(err)
	// URL resolves to a private or reserved IP address: 127.0.0.1
}
```

## Network Utilities

### SplitHostPort

Splits a network address into host and port components. An address without a
port, including a bare IPv6 address, returns the whole address as the host and
an empty port.

```go
// func SplitHostPort(addr string) (string, string, error)

host, port, err := netlib.SplitHostPort("localhost:8080")
// host = "localhost", port = "8080", err = nil

host, port, err = netlib.SplitHostPort("localhost")
// host = "localhost", port = "", err = nil

host, port, err = netlib.SplitHostPort("[::1]:8080")
// host = "::1", port = "8080", err = nil

host, port, err = netlib.SplitHostPort("2001:db8::1")
// host = "2001:db8::1", port = "", err = nil
```

A malformed address returns an error wrapping `netlib.ErrFailedToSplitHostPort`.

### DetectLocalNetwork

Reports whether a request address comes from this machine: it returns true when
the address is a loopback address inside the network of one of the local
interfaces. When `requestAddr` holds a comma-separated list (as
`X-Forwarded-For` does), only the first entry is checked.

```go
// func DetectLocalNetwork(requestAddr string) (bool, error)

isLocal, err := netlib.DetectLocalNetwork("127.0.0.1:54321")
// isLocal = true, err = nil

isLocal, err = netlib.DetectLocalNetwork("10.0.0.1:80,203.0.113.1:80")
// isLocal = false: 10.0.0.1 is a private address, not a loopback one
```

An entry that is not an IP address returns an error wrapping
`netlib.ErrInvalidIPAddress`.

### IsPrivateIP and ValidateExternalURL

`IsPrivateIP` reports whether an IP string falls in a private or reserved range:
`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`,
`169.254.0.0/16`, `0.0.0.0/8`, `100.64.0.0/10`, `::1/128`, `fc00::/7` and
`fe80::/10`. A string that does not parse returns false.

`ValidateExternalURL` checks a URL before an outbound request, to block
Server-Side Request Forgery (SSRF). It accepts only `http` and `https` (only
`https` when `requireHTTPS` is true), resolves the host name, and rejects the
URL when any resolved address is private or reserved:

```go
// func ValidateExternalURL(rawURL string, requireHTTPS bool) error

err := netlib.ValidateExternalURL(webhookURL, true)
if errors.Is(err, netlib.ErrSSRFBlocked) {
	return fmt.Errorf("webhook %q points at an internal address: %w", webhookURL, err)
}

if err != nil {
	return fmt.Errorf("check webhook %q: %w", webhookURL, err)
}
```

The errors wrap `netlib.ErrInvalidURL`, `netlib.ErrInsecureScheme` or
`netlib.ErrSSRFBlocked`. The check resolves the name when you call it, and the
HTTP client resolves it again when it connects.

## Cryptography

### CryptoGetRandomBytes

Returns `size` bytes from `crypto/rand`:

```go
// func CryptoGetRandomBytes(size int) ([]byte, error)

key, err := netlib.CryptoGetRandomBytes(32) // a 256-bit key
if err != nil {
	return fmt.Errorf("generate key: %w", err)
}
```

### GenerateSelfSignedCert

Creates a self-signed TLS certificate for development purposes: an RSA key of
2048 bits (`netlib.SelfSignedKeyLength`), the organization `Development`, valid
for 365 days from now and for server authentication. It names no host, so
clients that verify the chain reject it.

```go
// func GenerateSelfSignedCert() (tls.Certificate, error)

cert, err := netlib.GenerateSelfSignedCert()
if err != nil {
	return fmt.Errorf("generate development certificate: %w", err)
}

server := &http.Server{
	Addr:              ":8443",
	ReadHeaderTimeout: 5 * time.Second,
	TLSConfig:         &tls.Config{Certificates: []tls.Certificate{cert}},
}
```

The errors wrap `netlib.ErrPrivateKeyGeneration`,
`netlib.ErrCertificateGeneration` or `netlib.ErrKeyPairCreation`.

## SQL Types

`NullString` wraps `sql.NullString` and adds JSON support: an invalid value
encodes as `null`, and `null` decodes as an invalid value. Its methods have
pointer receivers, so marshal a pointer to the struct that holds it:

```go
type User struct {
	Name string         `json:"name"`
	Bio  netlib.NullString `json:"bio"`
}

user := User{Name: "Ada"}
user.Bio.String, user.Bio.Valid = "Developer", true

data, err := json.Marshal(&user)
// {"name":"Ada","bio":"Developer"}

err = db.QueryRowContext(ctx, "SELECT bio FROM users WHERE id = ?", userID).
	Scan(&user.Bio)
```

`Scan` accepts a `string`, a `[]byte` or `nil`; any other type returns an error
wrapping `netlib.ErrUnexpectedNullStringType`.

## Concurrency

The functions keep no state of their own and can be called from any number of
goroutines.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/lib/netlib`: the API reference
  generated from source
- [ajan/httpfx](../../httpfx/README.md): uses the address and certificate
  helpers
- [eser/stack on GitHub](https://github.com/eser/stack)
