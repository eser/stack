package httpclient_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"io"
	"math/big"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/quic-go/quic-go/http3"
)

// newH3Cert returns a self-signed certificate for 127.0.0.1, the kind a
// noskills daemon serves in development.
func newH3Cert(t *testing.T, commonName string) (tls.Certificate, *x509.Certificate) {
	t.Helper()

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	now := time.Now()
	template := &x509.Certificate{ //nolint:exhaustruct
		SerialNumber:          big.NewInt(now.UnixNano()),
		Subject:               pkix.Name{CommonName: commonName}, //nolint:exhaustruct
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

	return tls.Certificate{Certificate: [][]byte{der}, PrivateKey: key, Leaf: leaf}, leaf //nolint:exhaustruct
}

func h3Fingerprint(cert *x509.Certificate) []byte {
	sum := sha256.Sum256(cert.Raw)

	return sum[:]
}

// startH3Server serves "ok" over HTTP/3 on 127.0.0.1 with cert and returns the
// base URL.
func startH3Server(t *testing.T, cert *tls.Certificate) string {
	t.Helper()

	udpConn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen udp: %v", err)
	}

	server := &http3.Server{ //nolint:exhaustruct
		TLSConfig: &tls.Config{ //nolint:exhaustruct
			Certificates: []tls.Certificate{*cert},
			MinVersion:   tls.VersionTLS13,
			NextProtos:   []string{http3.NextProtoH3},
		},
		Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = io.WriteString(w, "ok")
		}),
	}

	served := make(chan error, 1)

	go func() {
		served <- server.Serve(udpConn)
	}()

	t.Cleanup(func() {
		if closeErr := server.Close(); closeErr != nil {
			t.Errorf("close server: %v", closeErr)
		}

		// Serve returns once the server is closed; its error is expected.
		t.Logf("serve returned: %v", <-served)
		_ = udpConn.Close() // Serve has returned; the error says nothing new
	})

	return "https://" + udpConn.LocalAddr().String()
}

// get sends one GET through a fresh HTTP/3 round tripper built from opts.
func get(t *testing.T, url string, opts ...httpclient.H3Option) (string, error) {
	t.Helper()

	opts = append(opts, httpclient.WithH3DialTimeout(5*time.Second))
	transport := httpclient.NewHTTP3RoundTripper(opts...)

	t.Cleanup(func() {
		if closer, ok := transport.(io.Closer); ok {
			_ = closer.Close() // the test is over; nothing reads this error
		}
	})

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	resp, err := transport.RoundTrip(req)
	if err != nil {
		return "", err //nolint:wrapcheck // the test reads the error as is
	}

	defer resp.Body.Close() //nolint:errcheck // a read-only test body

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	return string(body), nil
}

func TestHTTP3RoundTripperAcceptsThePinnedLeaf(t *testing.T) {
	t.Parallel()

	cert, leaf := newH3Cert(t, "daemon")
	url := startH3Server(t, &cert)

	body, err := get(t, url, httpclient.WithH3CertHashes([][]byte{h3Fingerprint(leaf)}))
	if err != nil {
		t.Fatalf("GET with the server's pin: %v", err)
	}

	if body != "ok" {
		t.Errorf("body = %q, want %q", body, "ok")
	}
}

func TestHTTP3RoundTripperRejectsUnpinnedServers(t *testing.T) {
	t.Parallel()

	daemon, daemonLeaf := newH3Cert(t, "daemon")
	attacker, _ := newH3Cert(t, "attacker")
	_, other := newH3Cert(t, "other daemon")

	// The daemon's certificate is public, so an attacker can send it after its
	// own leaf. Only the leaf proves who holds the key.
	behindAttacker := tls.Certificate{ //nolint:exhaustruct
		Certificate: [][]byte{attacker.Certificate[0], daemon.Certificate[0]},
		PrivateKey:  attacker.PrivateKey,
	}

	cases := []struct {
		name   string
		served *tls.Certificate
		opts   []httpclient.H3Option
	}{
		{
			name:   "pin for another certificate",
			served: &daemon,
			opts:   []httpclient.H3Option{httpclient.WithH3CertHashes([][]byte{h3Fingerprint(other)})},
		},
		{
			name:   "pinned certificate behind another leaf",
			served: &behindAttacker,
			opts:   []httpclient.H3Option{httpclient.WithH3CertHashes([][]byte{h3Fingerprint(daemonLeaf)})},
		},
		{
			name:   "self-signed certificate without a pin",
			served: &daemon,
			opts:   nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			url := startH3Server(t, tc.served)

			_, err := get(t, url, tc.opts...)
			if err == nil {
				t.Fatal("GET = nil error, want a TLS verification failure")
			}

			t.Logf("GET refused: %v", err)
		})
	}
}

func TestHTTP3TLSConfigSkipsChainVerificationOnlyWithAPin(t *testing.T) {
	t.Parallel()

	_, daemon := newH3Cert(t, "daemon")

	t.Run("without a pin", func(t *testing.T) {
		t.Parallel()

		cfg := httpclient.BuildH3TLSConfig()
		if cfg.InsecureSkipVerify || cfg.VerifyPeerCertificate != nil || cfg.VerifyConnection != nil {
			t.Error("chain verification was replaced although no pin is set")
		}
	})

	t.Run("with a pin", func(t *testing.T) {
		t.Parallel()

		base := &tls.Config{MinVersion: tls.VersionTLS12} //nolint:exhaustruct

		cfg := httpclient.BuildH3TLSConfig(
			httpclient.WithH3TLSClientConfig(base),
			httpclient.WithH3CertHashes([][]byte{h3Fingerprint(daemon)}),
		)

		if !cfg.InsecureSkipVerify || cfg.VerifyPeerCertificate == nil || cfg.VerifyConnection == nil {
			t.Error("InsecureSkipVerify is set without both pin callbacks")
		}

		if base.InsecureSkipVerify || base.VerifyPeerCertificate != nil || base.MinVersion != tls.VersionTLS12 {
			t.Error("the caller's config changed")
		}
	})
}

// A resumed session skips VerifyPeerCertificate, so VerifyConnection must
// check the pin on its own.
func TestHTTP3PinnedVerifyConnection(t *testing.T) {
	t.Parallel()

	_, daemon := newH3Cert(t, "daemon")
	_, attacker := newH3Cert(t, "attacker")

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

			cfg := httpclient.BuildH3TLSConfig(httpclient.WithH3CertHashes([][]byte{h3Fingerprint(daemon)}))

			err := cfg.VerifyConnection(tls.ConnectionState{PeerCertificates: tc.peers}) //nolint:exhaustruct
			if (err == nil) != tc.wantOK {
				t.Errorf("VerifyConnection() = %v, want ok=%v", err, tc.wantOK)
			}
		})
	}
}
