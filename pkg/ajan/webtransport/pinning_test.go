package webtransport_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"math/big"
	"net"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/webtransport"
)

// newCert returns a self-signed certificate for localhost and 127.0.0.1, the
// kind a noskills daemon serves in development.
func newCert(t *testing.T, commonName string) (tls.Certificate, *x509.Certificate) {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	now := time.Now()
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(now.UnixNano()),
		Subject:               pkix.Name{CommonName: commonName},
		NotBefore:             now.Add(-time.Hour),
		NotAfter:              now.Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost"},
		IPAddresses:           []net.IP{net.IPv4(127, 0, 0, 1)},
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}

	leaf, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}

	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key, Leaf: leaf}, leaf
}

func fingerprint(cert *x509.Certificate) []byte {
	sum := sha256.Sum256(cert.Raw)

	return sum[:]
}

func TestBuildDialerTLSConfigWithoutPins(t *testing.T) {
	t.Parallel()

	t.Run("no base config", func(t *testing.T) {
		t.Parallel()

		got := webtransport.BuildDialerTLSConfig(&webtransport.Config{})

		if got.MinVersion != tls.VersionTLS13 {
			t.Errorf("MinVersion = %#x, want TLS 1.3", got.MinVersion)
		}

		if got.InsecureSkipVerify || got.VerifyPeerCertificate != nil || got.VerifyConnection != nil {
			t.Error("chain verification was replaced although no pin is set")
		}
	})

	t.Run("caller's base config", func(t *testing.T) {
		t.Parallel()

		base := &tls.Config{MinVersion: tls.VersionTLS13, ServerName: "daemon.local"}

		if got := webtransport.BuildDialerTLSConfig(&webtransport.Config{TLSConfig: base}); got != base {
			t.Errorf("BuildDialerTLSConfig returned %p, want the caller's config %p unchanged", got, base)
		}
	})

	t.Run("caller's base config below TLS 1.3", func(t *testing.T) {
		t.Parallel()

		base := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: "daemon.local"}

		got := webtransport.BuildDialerTLSConfig(&webtransport.Config{TLSConfig: base})
		if got == base {
			t.Fatal("the caller's config was raised in place, want a clone")
		}

		if got.MinVersion != tls.VersionTLS13 || got.ServerName != "daemon.local" {
			t.Errorf("(MinVersion, ServerName) = (%#x, %q), want (TLS 1.3, %q)",
				got.MinVersion, got.ServerName, "daemon.local")
		}

		if base.MinVersion != tls.VersionTLS12 {
			t.Errorf("caller's MinVersion = %#x, want TLS 1.2 unchanged", base.MinVersion)
		}
	})
}

func TestBuildDialerTLSConfigPinsWithoutTouchingTheCallersConfig(t *testing.T) {
	t.Parallel()

	_, daemon := newCert(t, "daemon")
	base := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: "daemon.local"}

	got := webtransport.BuildDialerTLSConfig(&webtransport.Config{
		TLSConfig:  base,
		CertHashes: [][]byte{fingerprint(daemon)},
	})

	if got == base {
		t.Fatal("the caller's config was patched in place, want a clone")
	}

	if got.MinVersion != tls.VersionTLS13 || got.ServerName != "daemon.local" || !got.InsecureSkipVerify {
		t.Errorf("(MinVersion, ServerName, InsecureSkipVerify) = (%#x, %q, %v), want (TLS 1.3, %q, true)",
			got.MinVersion, got.ServerName, got.InsecureSkipVerify, "daemon.local")
	}

	if base.MinVersion != tls.VersionTLS12 || base.InsecureSkipVerify || base.VerifyPeerCertificate != nil {
		t.Error("the caller's config changed")
	}
}

func TestPinnedVerifyPeerCertificate(t *testing.T) {
	t.Parallel()

	_, daemon := newCert(t, "daemon")
	_, attacker := newCert(t, "attacker")
	_, other := newCert(t, "other daemon")

	cases := []struct {
		name     string
		pins     [][]byte
		rawCerts [][]byte
		wantOK   bool
	}{
		{
			name:     "pinned leaf",
			pins:     [][]byte{fingerprint(daemon)},
			rawCerts: [][]byte{daemon.Raw},
			wantOK:   true,
		},
		{
			name:     "pinned leaf followed by other certificates",
			pins:     [][]byte{fingerprint(daemon)},
			rawCerts: [][]byte{daemon.Raw, attacker.Raw},
			wantOK:   true,
		},
		{
			name:     "leaf matches the second of two pins",
			pins:     [][]byte{fingerprint(other), fingerprint(daemon)},
			rawCerts: [][]byte{daemon.Raw},
			wantOK:   true,
		},
		{
			// The daemon's certificate is public, so an attacker can append it
			// behind its own leaf. Only the leaf proves who holds the key.
			name:     "pinned certificate behind another leaf",
			pins:     [][]byte{fingerprint(daemon)},
			rawCerts: [][]byte{attacker.Raw, daemon.Raw},
			wantOK:   false,
		},
		{
			name:     "unpinned leaf",
			pins:     [][]byte{fingerprint(daemon)},
			rawCerts: [][]byte{attacker.Raw},
			wantOK:   false,
		},
		{
			name:     "no certificate",
			pins:     [][]byte{fingerprint(daemon)},
			rawCerts: nil,
			wantOK:   false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			cfg := webtransport.BuildDialerTLSConfig(&webtransport.Config{CertHashes: tc.pins})

			err := cfg.VerifyPeerCertificate(tc.rawCerts, nil)
			if (err == nil) != tc.wantOK {
				t.Errorf("VerifyPeerCertificate() = %v, want ok=%v", err, tc.wantOK)
			}
		})
	}
}

func TestPinnedVerifyConnection(t *testing.T) {
	t.Parallel()

	_, daemon := newCert(t, "daemon")
	_, attacker := newCert(t, "attacker")

	cases := []struct {
		name   string
		peers  []*x509.Certificate
		wantOK bool
	}{
		{name: "pinned leaf", peers: []*x509.Certificate{daemon}, wantOK: true},
		{name: "pinned certificate behind another leaf", peers: []*x509.Certificate{attacker, daemon}, wantOK: false},
		{name: "unpinned leaf", peers: []*x509.Certificate{attacker}, wantOK: false},
		{name: "no certificate", peers: nil, wantOK: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			cfg := webtransport.BuildDialerTLSConfig(&webtransport.Config{
				CertHashes: [][]byte{fingerprint(daemon)},
			})

			err := cfg.VerifyConnection(tls.ConnectionState{PeerCertificates: tc.peers})
			if (err == nil) != tc.wantOK {
				t.Errorf("VerifyConnection() = %v, want ok=%v", err, tc.wantOK)
			}
		})
	}
}

func TestPinsAreCopiedWhenTheConfigIsBuilt(t *testing.T) {
	t.Parallel()

	_, daemon := newCert(t, "daemon")
	pins := [][]byte{fingerprint(daemon)}

	cfg := webtransport.BuildDialerTLSConfig(&webtransport.Config{CertHashes: pins})

	pins[0][0] ^= 0xff // the caller reuses its buffer

	if err := cfg.VerifyPeerCertificate([][]byte{daemon.Raw}, nil); err != nil {
		t.Errorf("VerifyPeerCertificate() after the caller changed its pin slice = %v, want nil", err)
	}
}
