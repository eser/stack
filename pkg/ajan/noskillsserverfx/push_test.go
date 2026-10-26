package noskillsserverfx

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPushCoalescerAllowsOncePerPeriod(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

	type attempt struct {
		key  string
		at   time.Duration
		want bool
	}

	cases := []struct {
		name     string
		attempts []attempt
	}{
		{
			name: "first push for a key",
			attempts: []attempt{
				{key: "s1:error", at: 0, want: true},
			},
		},
		{
			name: "repeat inside the period",
			attempts: []attempt{
				{key: "s1:error", at: 0, want: true},
				{key: "s1:error", at: pushCoalescePeriod - time.Second, want: false},
			},
		},
		{
			name: "repeat once the period has passed",
			attempts: []attempt{
				{key: "s1:error", at: 0, want: true},
				{key: "s1:error", at: pushCoalescePeriod, want: true},
			},
		},
		{
			name: "keys coalesce independently",
			attempts: []attempt{
				{key: "s1:error", at: 0, want: true},
				{key: "s1:permission_request", at: time.Second, want: true},
				{key: "s2:error", at: 2 * time.Second, want: true},
				{key: "s1:error", at: 3 * time.Second, want: false},
			},
		},
		{
			name: "a suppressed repeat does not extend the period",
			attempts: []attempt{
				{key: "s1:error", at: 0, want: true},
				{key: "s1:error", at: pushCoalescePeriod / 2, want: false},
				{key: "s1:error", at: pushCoalescePeriod, want: true},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			coalescer := newPushCoalescer()

			for i, a := range tc.attempts {
				if got := coalescer.allow(a.key, start.Add(a.at)); got != a.want {
					t.Fatalf("attempt %d: allow(%q, +%v) = %v, want %v", i, a.key, a.at, got, a.want)
				}
			}
		})
	}
}

// TestPushCoalescerForgetsKeysPastTheirPeriod pins the bound on the map.
//
// Every Dispatch used to add a "sid:kind" entry that was never deleted, so the
// map grew for as long as the daemon ran. It now holds only the keys that
// pushed within the last period.
func TestPushCoalescerForgetsKeysPastTheirPeriod(t *testing.T) {
	t.Parallel()

	const sessions = 100

	start := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	coalescer := newPushCoalescer()

	for i := range sessions {
		coalescer.allow(fmt.Sprintf("s%d:error", i), start)
	}

	if got := len(coalescer.last); got != sessions {
		t.Fatalf("map holds %d keys inside the period, want %d", got, sessions)
	}

	later := start.Add(pushCoalescePeriod)

	if !coalescer.allow("fresh:error", later) {
		t.Fatal("a new key was suppressed")
	}

	if got := len(coalescer.last); got != 1 {
		t.Fatalf("map holds %d keys after the period passed, want only the 1 active key", got)
	}
}

func TestOpenSubscriptionStore(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		contents *string
		wantSubs int
		wantErr  bool
	}{
		{name: "no file yet", contents: nil, wantSubs: 0, wantErr: false},
		{
			name:     "saved subscriptions",
			contents: new(`[{"id":"a","endpoint":"https://push.example/a","keys":{"auth":"x","p256dh":"y"}}]`),
			wantSubs: 1,
			wantErr:  false,
		},
		{name: "malformed file", contents: new(`[{"id":`), wantSubs: 0, wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			dataDir := t.TempDir()
			path := filepath.Join(dataDir, "push", "subscriptions.json")

			if tc.contents != nil {
				if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
					t.Fatalf("mkdir: %v", err)
				}

				if err := os.WriteFile(path, []byte(*tc.contents), 0o600); err != nil {
					t.Fatalf("write fixture: %v", err)
				}
			}

			store, err := openSubscriptionStore(dataDir)
			if tc.wantErr {
				if err == nil {
					t.Fatal("openSubscriptionStore accepted a malformed file")
				}

				// The file must survive, so the user can repair it.
				data, readErr := os.ReadFile(path) //nolint:gosec // test fixture path
				if readErr != nil || string(data) != *tc.contents {
					t.Fatalf("malformed file was changed: %q, %v", data, readErr)
				}

				return
			}

			if err != nil {
				t.Fatalf("openSubscriptionStore: %v", err)
			}

			if got := len(store.subs); got != tc.wantSubs {
				t.Fatalf("store holds %d subscriptions, want %d", got, tc.wantSubs)
			}
		})
	}
}

func TestLoadOrGenerateVAPIDKeys(t *testing.T) {
	t.Parallel()

	const saved = `{"publicKey":"pub","privateKey":"priv"}`

	cases := []struct {
		name     string
		contents *string
		wantPub  string // "" means a freshly generated key
		wantErr  bool
	}{
		{name: "no file yet generates a pair", contents: nil, wantPub: "", wantErr: false},
		{name: "saved pair is reused", contents: new(saved), wantPub: "pub", wantErr: false},
		{name: "malformed file is an error", contents: new(`{"publicKey":`), wantErr: true},
		{name: "missing private key is an error", contents: new(`{"publicKey":"pub"}`), wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			dataDir := t.TempDir()
			path := filepath.Join(dataDir, "push", "vapid.json")

			if tc.contents != nil {
				if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
					t.Fatalf("mkdir: %v", err)
				}

				if err := os.WriteFile(path, []byte(*tc.contents), 0o600); err != nil {
					t.Fatalf("write fixture: %v", err)
				}
			}

			kp, err := loadOrGenerateVAPIDKeys(dataDir)
			if tc.wantErr {
				if err == nil {
					t.Fatal("loadOrGenerateVAPIDKeys accepted a broken key file")
				}

				// The broken file must survive: replacing the keys would silently
				// invalidate every stored subscription.
				data, readErr := os.ReadFile(path) //nolint:gosec // test fixture path
				if readErr != nil || string(data) != *tc.contents {
					t.Fatalf("key file was changed: %q, %v", data, readErr)
				}

				return
			}

			if err != nil {
				t.Fatalf("loadOrGenerateVAPIDKeys: %v", err)
			}

			if tc.wantPub != "" && kp.PublicKey != tc.wantPub {
				t.Fatalf("PublicKey = %q, want the saved %q", kp.PublicKey, tc.wantPub)
			}

			if kp.PublicKey == "" || kp.PrivateKey == "" {
				t.Fatalf("incomplete key pair returned: %+v", kp)
			}

			again, err := loadOrGenerateVAPIDKeys(dataDir)
			if err != nil {
				t.Fatalf("second load: %v", err)
			}

			if *again != *kp {
				t.Fatal("a second load returned a different key pair; the first was not persisted")
			}
		})
	}
}
