# Cryptography, Files and Untrusted Data

Choosing cryptographic primitives, handling files from untrusted sources, and
decoding untrusted formats. Randomness is in security-rules.md: Secure
Randomness; path confinement in security-rules.md: No Injection Through Strings.

## Contents

- Use Vetted Primitives
- Hashing Personal Data
- Files From Untrusted Sources
- Decoding Untrusted Formats

---

## Use Vetted Primitives

Scope: Encryption, hashing, signatures and TLS, in Go and TypeScript

Rule: Use the standard library or `golang.org/x/crypto` (already a dependency)
and never write a cipher, a mode or a token format by hand. Pick by purpose:

| Purpose                | Use                                               | Never                                       |
| ---------------------- | ------------------------------------------------- | ------------------------------------------- |
| Symmetric encryption   | AES-256-GCM, ChaCha20-Poly1305                    | ECB (raw `block.Encrypt`), DES, RC4         |
| Password storage       | Argon2id, bcrypt (http-and-auth.md)               | MD5, SHA-1, plain SHA-256                   |
| Message authentication | HMAC-SHA256, checked with `hmac.Equal`            | HMAC-MD5, `==` on MACs                      |
| Signatures             | Ed25519, ECDSA P-256, RSA-PSS 2048+               | RSA keys under 2048 bits                    |
| Public-key encryption  | `crypto/hpke`, RSA-OAEP                           | RSA PKCS #1 v1.5 encryption                 |
| Digests (non-secret)   | SHA-256, `crypto/sha3`                            | MD5 or SHA-1 for anything security-relevant |
| Key derivation         | `crypto/hkdf`, `crypto/pbkdf2` (600k+ iterations) | a bare hash of the secret                   |
| TLS                    | 1.2 minimum, 1.3 preferred, 1.3 for QUIC          | `MinVersion` below 1.2                      |

- A GCM nonce is 12 random bytes per encryption from `crypto/rand`, stored with
  the ciphertext. A repeated nonce under the same key breaks both
  confidentiality and integrity.
- Compare secrets, tokens and MACs in constant time:
  `subtle.ConstantTimeCompare` or `hmac.Equal`.
- `InsecureSkipVerify` is allowed only where a `VerifyPeerCertificate` pin
  replaces chain validation, as `webtransport` does for certificate hashes, with
  the reason in a `//nolint:gosec` comment. SSH clients verify host keys
  (`ssh.FixedHostKey` or known_hosts), never `ssh.InsecureIgnoreHostKey`.
- An encryption error fails the operation. Continuing with plaintext after a
  failed encrypt is the one error-handling mistake that leaks data by design.
- Encryption keys that must rotate wrap a random per-record data key with a key
  encryption key (envelope encryption), so rotation re-encrypts only the data
  keys.

**Why:** a primitive chosen for the wrong purpose (a fast hash for passwords, a
MAC compared with `==`) fails as badly as a broken one, and reviewers catch it
more easily against a fixed table.

---

## Hashing Personal Data

Scope: Pseudonymous ids sent to analytics, traces or third parties

Rule: A plain hash of an email or phone number is not anonymous: the input space
is small enough to reverse by guessing. When a stable pseudonym is needed, use
HMAC-SHA256 with a secret key from the environment, and prefer the internal user
id over any derived value.

---

## Files From Untrusted Sources

Scope: Uploads, archives, downloaded files and user-given paths

Rule:

- Confine every path to a root with `os.OpenRoot` and its methods, including
  archive extraction: an entry named `../../etc/cron.d/x` must fail to open, not
  be joined and cleaned. `os.Root` blocks traversal and escaping symlinks, but
  it is not a sandbox; still reject special files (devices, named pipes) in
  archives.
- Bound decompressed size. Wrap the reader in `io.LimitReader(r, max+1)` and
  fail when more than `max` bytes arrive; a small archive can expand to
  gigabytes. Bound the number of entries too.
- Create temporary files with `os.CreateTemp` (unpredictable name, mode 0600)
  and remove them when done.
- Permissions: 0600 for files holding secrets or tokens, 0750 for directories,
  0644 only for data that is safe for every local user to read. Never 0666 or
  0777.

Correct:

```go
func extract(dst string, zr *zip.Reader, maxBytes int64) error {
    root, err := os.OpenRoot(dst)
    if err != nil {
        return fmt.Errorf("open extraction root: %w", err)
    }
    defer root.Close()

    for _, entry := range zr.File {
        if entry.FileInfo().IsDir() {
            continue // directories are created on demand by copyEntry
        }
        if !entry.Mode().IsRegular() {
            return fmt.Errorf("archive entry %q is not a regular file", entry.Name)
        }
        if err := copyEntry(root, entry, maxBytes); err != nil {
            return fmt.Errorf("extract %q: %w", entry.Name, err)
        }
    }
    return nil
}
```

**Why:** archive and upload handling turns attacker-chosen names and sizes into
file system operations; confinement and limits are the only checks that do not
depend on predicting every malicious name.

---

## Decoding Untrusted Formats

Scope: JSON, XML, gob, YAML and other decoders fed external input

Rule:

- Bound the input first (`http.MaxBytesReader`, `io.LimitReader`), then decode
  into a concrete struct, never `any`, and validate the result
  (security-rules.md: Input Validation).
- Never decode untrusted input with `encoding/gob`; its documentation says it is
  not hardened against adversarial input.
- `encoding/xml` does not fetch external entities or expand DTDs, so XXE does
  not apply to it; other XML libraries must have external entities off.
- Sizes and counts computed from input (`rows * cols`, a length prefix) are
  checked against a maximum before allocating, so an overflow or a huge value
  cannot allocate unbounded memory.
