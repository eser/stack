package noskillsserverfx

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	bcryptCost = 12

	defaultTokenTTL   = 24 * time.Hour
	tokenValueByteLen = 32
	rateLimitWindow   = time.Minute
	rateLimitMax      = 5
	lockoutThreshold  = 10
	lockoutDuration   = 5 * time.Minute
)

// ── Persistent auth state (auth.json) ─────────────────────────────────────────

type persistedAuthState struct {
	PINHash string      `json:"pinHash,omitempty"`
	Tokens  []authToken `json:"tokens"`
}

type authToken struct {
	Value     string    `json:"value"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// ── In-memory rate-limit state ────────────────────────────────────────────────

type ipAttempts struct {
	failTimestamps []time.Time
	totalFails     int
	lockedUntil    time.Time
}

func (a *ipAttempts) pruneWindow(now time.Time) {
	cutoff := now.Add(-rateLimitWindow)
	kept := a.failTimestamps[:0]

	for _, t := range a.failTimestamps {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}

	a.failTimestamps = kept
}

func (a *ipAttempts) isLocked(now time.Time) bool {
	return a.lockedUntil.After(now)
}

func (a *ipAttempts) isRateLimited(now time.Time) bool {
	a.pruneWindow(now)

	return len(a.failTimestamps) >= rateLimitMax
}

func (a *ipAttempts) recordFail(now time.Time) {
	a.failTimestamps = append(a.failTimestamps, now)
	a.totalFails++

	if a.totalFails >= lockoutThreshold {
		a.lockedUntil = now.Add(lockoutDuration)
	}
}

func (a *ipAttempts) resetOnSuccess() {
	a.failTimestamps = a.failTimestamps[:0]
	a.totalFails = 0
	a.lockedUntil = time.Time{}
}

// ── AuthManager ───────────────────────────────────────────────────────────────

// AuthManager handles PIN setup, login (rate-limited), and token lifecycle.
// Persistent state lives in <dataDir>/auth.json (0600). Rate-limit counters
// are in-memory only — they reset on daemon restart.
type AuthManager struct {
	mu       sync.Mutex
	dataDir  string
	state    persistedAuthState
	attempts map[string]*ipAttempts
}

// NewAuthManager creates an AuthManager, loading any existing auth.json.
func NewAuthManager(dataDir string) (*AuthManager, error) {
	am := &AuthManager{
		dataDir:  dataDir,
		attempts: make(map[string]*ipAttempts),
		state: persistedAuthState{
			Tokens: []authToken{},
		},
	}

	if err := am.load(); err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("load auth state: %w", err)
	}

	return am, nil
}

// IsPINSetup returns true when a PIN hash is stored — i.e. first-run setup
// has been completed. Before setup, all routes are accessible.
func (am *AuthManager) IsPINSetup() bool {
	am.mu.Lock()
	defer am.mu.Unlock()

	return am.state.PINHash != ""
}

// SetupPIN hashes pin and persists it. Returns an error if a PIN is already
// configured (first-run-only: use RevokeAllTokens + ResetPIN to change it).
func (am *AuthManager) SetupPIN(pin string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	if am.state.PINHash != "" {
		return fmt.Errorf("PIN already configured") //nolint:err113
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcryptCost)
	if err != nil {
		return fmt.Errorf("hash PIN: %w", err)
	}

	am.state.PINHash = string(hash)

	return am.save()
}

// ResetPIN replaces the current PIN (even if one is already set) and invalidates
// all existing tokens. Use for noskills-server pin reprint.
func (am *AuthManager) ResetPIN(pin string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcryptCost)
	if err != nil {
		return fmt.Errorf("hash PIN: %w", err)
	}

	am.state.PINHash = string(hash)
	am.state.Tokens = nil // invalidate all existing sessions

	return am.save()
}

// GenerateAndSetPIN creates a cryptographically random 6-digit PIN, sets it
// (first-run) or resets it (subsequent calls), and returns the plain PIN.
func (am *AuthManager) GenerateAndSetPIN() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate PIN: %w", err)
	}

	// Map 4 random bytes to a 6-digit decimal value (000000–999999).
	n := (int(b[0])<<24 | int(b[1])<<16 | int(b[2])<<8 | int(b[3])) & 0x7FFFFFFF
	pin := fmt.Sprintf("%06d", n%1_000_000)

	am.mu.Lock()
	defer am.mu.Unlock()

	hash, err := bcrypt.GenerateFromPassword([]byte(pin), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash PIN: %w", err)
	}

	am.state.PINHash = string(hash)
	am.state.Tokens = nil // invalidate any existing sessions on PIN change

	if err := am.save(); err != nil {
		return "", err
	}

	return pin, nil
}

// Login verifies pin for the given ip address (rate-limited) and returns a new
// token on success. Returns a typed error on rate-limit or lockout.
func (am *AuthManager) Login(ip, pin string) (*authToken, error) {
	am.mu.Lock()
	defer am.mu.Unlock()

	now := time.Now()

	atm := am.attemptRecord(ip)

	if atm.isLocked(now) {
		until := atm.lockedUntil.Format(time.RFC3339)

		return nil, fmt.Errorf("account locked until %s", until) //nolint:err113
	}

	if atm.isRateLimited(now) {
		return nil, fmt.Errorf("too many attempts; try again in a moment") //nolint:err113
	}

	if err := bcrypt.CompareHashAndPassword([]byte(am.state.PINHash), []byte(pin)); err != nil {
		atm.recordFail(now)

		return nil, fmt.Errorf("invalid PIN") //nolint:err113
	}

	atm.resetOnSuccess()
	am.pruneExpiredTokens(now)

	tok, err := generateToken(now)
	if err != nil {
		return nil, fmt.Errorf("generate token: %w", err)
	}

	am.state.Tokens = append(am.state.Tokens, *tok)

	if err := am.save(); err != nil {
		return nil, fmt.Errorf("save auth state: %w", err)
	}

	return tok, nil
}

// IsValidToken returns true when token matches an unexpired stored token.
// Uses constant-time comparison to prevent timing attacks.
func (am *AuthManager) IsValidToken(token string) bool {
	if token == "" {
		return false
	}

	am.mu.Lock()
	defer am.mu.Unlock()

	now := time.Now()
	tokenBytes := []byte(token)

	for _, t := range am.state.Tokens {
		if t.ExpiresAt.Before(now) {
			continue
		}

		if subtle.ConstantTimeCompare([]byte(t.Value), tokenBytes) == 1 {
			return true
		}
	}

	return false
}

// Logout removes the given token from the store.
func (am *AuthManager) Logout(token string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	now := time.Now()
	updated := am.state.Tokens[:0]

	for _, t := range am.state.Tokens {
		if t.ExpiresAt.Before(now) {
			continue
		}

		if subtle.ConstantTimeCompare([]byte(t.Value), []byte(token)) != 1 {
			updated = append(updated, t)
		}
	}

	am.state.Tokens = updated

	return am.save()
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (am *AuthManager) attemptRecord(ip string) *ipAttempts {
	if a, ok := am.attempts[ip]; ok {
		return a
	}

	a := &ipAttempts{}
	am.attempts[ip] = a

	return a
}

func (am *AuthManager) pruneExpiredTokens(now time.Time) {
	kept := am.state.Tokens[:0]

	for _, t := range am.state.Tokens {
		if t.ExpiresAt.After(now) {
			kept = append(kept, t)
		}
	}

	am.state.Tokens = kept
}

func generateToken(now time.Time) (*authToken, error) {
	raw := make([]byte, tokenValueByteLen)

	if _, err := rand.Read(raw); err != nil {
		return nil, fmt.Errorf("rand read: %w", err)
	}

	return &authToken{
		Value:     hex.EncodeToString(raw),
		CreatedAt: now,
		ExpiresAt: now.Add(defaultTokenTTL),
	}, nil
}

func (am *AuthManager) authStatePath() string {
	return filepath.Join(am.dataDir, "auth.json")
}

func (am *AuthManager) load() error {
	path := am.authStatePath()

	data, err := os.ReadFile(path) //nolint:gosec // daemon-internal state file at a computed path
	if err != nil {
		return err // may be os.IsNotExist(err) — caller handles
	}

	return json.Unmarshal(data, &am.state)
}

func (am *AuthManager) save() error {
	path := am.authStatePath()

	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}

	data, err := json.MarshalIndent(am.state, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	// Atomic write: tmp + rename.
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}

	return os.Rename(tmp, path)
}
