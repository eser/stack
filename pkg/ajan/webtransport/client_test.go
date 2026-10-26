package webtransport_test

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/webtransport"
	"github.com/quic-go/quic-go/http3"
	wt "github.com/quic-go/webtransport-go"
)

// These tests dial a real webtransport-go server over loopback UDP, so they
// cover the client against the dependency it wraps.

// startServer serves WebTransport on /attach with cert and runs handle for
// each session. It returns the server's base URL.
func startServer(t *testing.T, cert *tls.Certificate, handle func(*wt.Session, *http.Request)) string {
	t.Helper()

	udpConn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen udp: %v", err)
	}

	server := &wt.Server{
		H3: &http3.Server{
			TLSConfig: &tls.Config{
				Certificates: []tls.Certificate{*cert},
				MinVersion:   tls.VersionTLS13,
				NextProtos:   []string{http3.NextProtoH3},
			},
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/attach", func(w http.ResponseWriter, r *http.Request) {
		sess, upgradeErr := server.Upgrade(w, r)
		if upgradeErr != nil {
			w.WriteHeader(http.StatusBadRequest)

			return
		}

		handle(sess, r)
		<-sess.Context().Done()
	})
	server.H3.Handler = mux

	served := make(chan error, 1)

	go func() {
		served <- server.Serve(udpConn)
	}()

	t.Cleanup(func() {
		if closeErr := server.Close(); closeErr != nil {
			t.Errorf("close server: %v", closeErr)
		}

		<-served
		_ = udpConn.Close() // Serve has returned; the error says nothing new
	})

	return "https://" + udpConn.LocalAddr().String()
}

// startSilentPeer returns the address of a UDP socket that never answers and
// a channel that is closed when the first packet arrives, which shows a dial
// is in flight.
func startSilentPeer(t *testing.T) (string, <-chan struct{}) {
	t.Helper()

	conn, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen udp: %v", err)
	}

	t.Cleanup(func() {
		_ = conn.Close() // ends the read below; nothing else uses the socket
	})

	firstPacket := make(chan struct{})

	go func() {
		buf := make([]byte, 2048)
		if _, _, readErr := conn.ReadFrom(buf); readErr == nil {
			close(firstPacket)
		}
	}()

	return "https://" + conn.LocalAddr().String(), firstPacket
}

// newClient builds a Client and fails the test when an option is rejected.
func newClient(t *testing.T, opts ...webtransport.Option) *webtransport.Client {
	t.Helper()

	client, err := webtransport.NewClient(opts...)
	if err != nil {
		t.Fatalf("NewClient() = %v", err)
	}

	return client
}

func pinnedClient(t *testing.T, leaf *x509.Certificate) *webtransport.Client {
	t.Helper()

	client := newClient(t, webtransport.WithCertHashes([][]byte{fingerprint(leaf)}))

	t.Cleanup(func() {
		_ = client.Close() // always nil
	})

	return client
}

func echoStreams(sess *wt.Session) {
	go func() {
		for {
			str, err := sess.AcceptStream(sess.Context())
			if err != nil {
				return
			}

			go func() {
				_, _ = io.Copy(str, str) // the client reads the echo and sees any failure
				_ = str.Close()
			}()
		}
	}()
}

func TestClientEchoesOverAPinnedSession(t *testing.T) {
	t.Parallel()

	cert, leaf := newCert(t, "daemon")
	baseURL := startServer(t, &cert, func(sess *wt.Session, _ *http.Request) {
		echoStreams(sess)
	})

	sess, err := pinnedClient(t, leaf).Connect(t.Context(), baseURL+"/attach")
	if err != nil {
		t.Fatalf("Connect() = %v", err)
	}

	if sess.Inner() == nil {
		t.Fatal("Inner() = nil, want the webtransport-go session")
	}

	cases := []struct {
		name string
		open func() (*wt.Stream, error)
	}{
		{name: "OpenBidiStream", open: sess.OpenBidiStream},
		{name: "OpenBidiStreamSync", open: func() (*wt.Stream, error) { return sess.OpenBidiStreamSync(t.Context()) }},
	}

	for _, tc := range cases {
		str, openErr := tc.open()
		if openErr != nil {
			t.Fatalf("%s() = %v", tc.name, openErr)
		}

		if deadlineErr := str.SetDeadline(time.Now().Add(5 * time.Second)); deadlineErr != nil {
			t.Fatalf("SetDeadline: %v", deadlineErr)
		}

		if _, writeErr := str.Write([]byte("ping " + tc.name)); writeErr != nil {
			t.Fatalf("write on %s stream: %v", tc.name, writeErr)
		}

		if closeErr := str.Close(); closeErr != nil {
			t.Fatalf("close send side of %s stream: %v", tc.name, closeErr)
		}

		reply, readErr := io.ReadAll(str)
		if readErr != nil {
			t.Fatalf("read echo on %s stream: %v", tc.name, readErr)
		}

		if got, want := string(reply), "ping "+tc.name; got != want {
			t.Errorf("echo on %s stream = %q, want %q", tc.name, got, want)
		}
	}

	if closeErr := sess.Close(); closeErr != nil {
		t.Fatalf("Session.Close() = %v", closeErr)
	}

	select {
	case <-sess.Context().Done():
	case <-time.After(5 * time.Second):
		t.Error("session context still open 5s after Close")
	}
}

func TestClientSendsRequestHeaders(t *testing.T) {
	t.Parallel()

	cert, leaf := newCert(t, "daemon")
	seen := make(chan string, 1)
	baseURL := startServer(t, &cert, func(_ *wt.Session, r *http.Request) {
		seen <- r.Header.Get("Authorization")
	})

	headers := http.Header{}
	headers.Set("Authorization", "Bearer t0ken")

	sess, err := pinnedClient(t, leaf).ConnectWithHeaders(t.Context(), baseURL+"/attach", headers)
	if err != nil {
		t.Fatalf("ConnectWithHeaders() = %v", err)
	}

	defer sess.Close() //nolint:errcheck // the assertions below do not depend on it

	if got := <-seen; got != "Bearer t0ken" {
		t.Errorf("server saw Authorization %q, want %q", got, "Bearer t0ken")
	}
}

func TestClientAcceptsStreamsTheServerOpens(t *testing.T) {
	t.Parallel()

	cert, leaf := newCert(t, "daemon")
	fromClient := make(chan string, 1)
	baseURL := startServer(t, &cert, func(sess *wt.Session, _ *http.Request) {
		go func() {
			uni, err := sess.OpenUniStream()
			if err != nil {
				return
			}

			_, _ = uni.Write([]byte("server uni")) // the client asserts on what arrives
			_ = uni.Close()

			bidi, err := sess.OpenStream()
			if err != nil {
				return
			}

			_, _ = bidi.Write([]byte("server bidi"))
			_ = bidi.Close()

			in, err := sess.AcceptUniStream(sess.Context())
			if err != nil {
				return
			}

			body, _ := io.ReadAll(in) // a short read fails the comparison in the test
			fromClient <- string(body)
		}()
	})

	sess, err := pinnedClient(t, leaf).Connect(t.Context(), baseURL+"/attach")
	if err != nil {
		t.Fatalf("Connect() = %v", err)
	}

	defer sess.Close() //nolint:errcheck // the assertions below do not depend on it

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	uni, err := sess.AcceptUniStream(ctx)
	if err != nil {
		t.Fatalf("AcceptUniStream() = %v", err)
	}

	if body, readErr := io.ReadAll(uni); readErr != nil || string(body) != "server uni" {
		t.Errorf("uni stream = (%q, %v), want (%q, nil)", body, readErr, "server uni")
	}

	bidi, err := sess.AcceptBidiStream(ctx)
	if err != nil {
		t.Fatalf("AcceptBidiStream() = %v", err)
	}

	if body, readErr := io.ReadAll(bidi); readErr != nil || string(body) != "server bidi" {
		t.Errorf("bidi stream = (%q, %v), want (%q, nil)", body, readErr, "server bidi")
	}

	out, err := sess.OpenUniStream()
	if err != nil {
		t.Fatalf("OpenUniStream() = %v", err)
	}

	if _, writeErr := out.Write([]byte("client uni")); writeErr != nil {
		t.Fatalf("write on uni stream: %v", writeErr)
	}

	if closeErr := out.Close(); closeErr != nil {
		t.Fatalf("close uni stream: %v", closeErr)
	}

	select {
	case got := <-fromClient:
		if got != "client uni" {
			t.Errorf("server read %q, want %q", got, "client uni")
		}
	case <-ctx.Done():
		t.Error("server did not receive the client's uni stream")
	}
}

func TestClientDatagramsReachTheServer(t *testing.T) {
	t.Parallel()

	cert, leaf := newCert(t, "daemon")
	baseURL := startServer(t, &cert, func(sess *wt.Session, _ *http.Request) {
		go func() {
			for {
				msg, err := sess.ReceiveDatagram(sess.Context())
				if err != nil {
					return
				}

				_ = sess.SendDatagram(append([]byte("echo "), msg...)) // lossy by design
			}
		}()
	})

	sess, err := pinnedClient(t, leaf).Connect(t.Context(), baseURL+"/attach")
	if err != nil {
		t.Fatalf("Connect() = %v", err)
	}

	defer sess.Close() //nolint:errcheck // the assertions below do not depend on it

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()

	received := make(chan []byte, 1)

	go func() {
		msg, receiveErr := sess.ReceiveDatagram(ctx)
		if receiveErr == nil {
			received <- msg
		}
	}()

	// Datagrams may be dropped even on loopback, so resend until the echo
	// arrives or the deadline passes.
	resend := time.NewTicker(100 * time.Millisecond)
	defer resend.Stop()

	for {
		if sendErr := sess.SendDatagram([]byte("presence")); sendErr != nil {
			t.Fatalf("SendDatagram() = %v", sendErr)
		}

		select {
		case msg := <-received:
			if string(msg) != "echo presence" {
				t.Errorf("datagram echo = %q, want %q", msg, "echo presence")
			}

			return
		case <-ctx.Done():
			t.Fatal("no datagram echo within 5s")
		case <-resend.C:
		}
	}
}

func TestClientTrustsAServerThroughTheCallersRoots(t *testing.T) {
	t.Parallel()

	cert, leaf := newCert(t, "daemon")
	baseURL := startServer(t, &cert, func(*wt.Session, *http.Request) {})

	roots := x509.NewCertPool()
	roots.AddCert(leaf)

	client := newClient(t, webtransport.WithTLSClientConfig(&tls.Config{
		RootCAs:    roots,
		MinVersion: tls.VersionTLS13,
	}))
	defer client.Close() //nolint:errcheck // always nil

	sess, err := client.Connect(t.Context(), baseURL+"/attach")
	if err != nil {
		t.Fatalf("Connect() with the server's certificate as a root = %v", err)
	}

	if closeErr := sess.Close(); closeErr != nil {
		t.Errorf("Session.Close() = %v", closeErr)
	}
}

func TestClientRejectsUntrustedServers(t *testing.T) {
	t.Parallel()

	cert, _ := newCert(t, "daemon")
	_, other := newCert(t, "other daemon")
	baseURL := startServer(t, &cert, func(*wt.Session, *http.Request) {})

	cases := []struct {
		name string
		opts []webtransport.Option
	}{
		{name: "pin for another certificate", opts: []webtransport.Option{
			webtransport.WithCertHashes([][]byte{fingerprint(other)}),
		}},
		{name: "self-signed certificate without a pin", opts: nil},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := newClient(t, tc.opts...)
			defer client.Close() //nolint:errcheck // always nil

			sess, err := client.Connect(t.Context(), baseURL+"/attach")
			if err == nil {
				_ = sess.Close() // the test already failed; this only frees the session
				t.Fatal("Connect() = nil error, want a TLS verification failure")
			}

			if errors.Is(err, webtransport.ErrClientClosed) {
				t.Errorf("Connect() = %v, want a verification error, not ErrClientClosed", err)
			}
		})
	}
}

func TestClientErrorsLeaveTheURLQueryOut(t *testing.T) {
	t.Parallel()

	cert, _ := newCert(t, "daemon")
	_, other := newCert(t, "other daemon")
	baseURL := startServer(t, &cert, func(*wt.Session, *http.Request) {})

	cases := []struct {
		name     string
		rawURL   string
		wantPart string
	}{
		{name: "failed dial", rawURL: baseURL + "/attach?token=s3cret", wantPart: "/attach"},
		{name: "unparsable URL", rawURL: "https://127.0.0.1:1/%zz?token=s3cret", wantPart: "parse url"},
		{name: "user info", rawURL: "https://admin:s3cret@" + strings.TrimPrefix(baseURL, "https://") + "/attach", wantPart: "/attach"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			client := pinnedClient(t, other)

			_, err := client.Connect(t.Context(), tc.rawURL)
			if err == nil {
				t.Fatal("Connect() = nil error, want a failure")
			}

			if strings.Contains(err.Error(), "s3cret") {
				t.Errorf("error %q repeats the secret from the URL", err)
			}

			if !strings.Contains(err.Error(), tc.wantPart) {
				t.Errorf("error %q does not contain %q", err, tc.wantPart)
			}
		})
	}
}

func TestClientClose(t *testing.T) {
	t.Parallel()

	t.Run("before any Connect", func(t *testing.T) {
		t.Parallel()

		client := newClient(t)

		if err := client.Close(); err != nil {
			t.Fatalf("Close() = %v, want nil", err)
		}

		if err := client.Close(); err != nil {
			t.Fatalf("second Close() = %v, want nil", err)
		}

		_, err := client.Connect(t.Context(), "https://127.0.0.1:1/attach")
		if !errors.Is(err, webtransport.ErrClientClosed) {
			t.Errorf("Connect() after Close = %v, want ErrClientClosed", err)
		}
	})

	t.Run("during a dial", func(t *testing.T) {
		t.Parallel()

		peerURL, firstPacket := startSilentPeer(t)
		client := newClient(t, webtransport.WithCertHashes([][]byte{make([]byte, 32)}))

		result := make(chan error, 1)

		go func() {
			_, err := client.Connect(t.Context(), peerURL+"/attach")
			result <- err
		}()

		select {
		case <-firstPacket:
		case <-time.After(5 * time.Second):
			t.Fatal("the dial sent nothing within 5s")
		}

		if err := client.Close(); err != nil {
			t.Fatalf("Close() = %v, want nil", err)
		}

		select {
		case err := <-result:
			if !errors.Is(err, webtransport.ErrClientClosed) {
				t.Errorf("Connect() interrupted by Close = %v, want ErrClientClosed", err)
			}
		case <-time.After(3 * time.Second):
			t.Error("Connect() still running 3s after Close")
		}
	})
}

func TestClientDialEndsWithTheCallersContext(t *testing.T) {
	t.Parallel()

	peerURL, firstPacket := startSilentPeer(t)
	client := newClient(t, webtransport.WithCertHashes([][]byte{make([]byte, 32)}))
	defer client.Close() //nolint:errcheck // always nil

	ctx, cancel := context.WithCancel(t.Context())
	result := make(chan error, 1)

	go func() {
		_, err := client.Connect(ctx, peerURL+"/attach")
		result <- err
	}()

	select {
	case <-firstPacket:
	case <-time.After(5 * time.Second):
		t.Fatal("the dial sent nothing within 5s")
	}

	cancel()

	select {
	case err := <-result:
		if !errors.Is(err, context.Canceled) {
			t.Errorf("Connect() after the caller cancelled = %v, want context.Canceled", err)
		}
	case <-time.After(3 * time.Second):
		t.Error("Connect() still running 3s after the caller cancelled")
	}
}

func TestClientDialTimeoutBoundsTheHandshake(t *testing.T) {
	t.Parallel()

	peerURL, _ := startSilentPeer(t)
	client := newClient(t,
		webtransport.WithCertHashes([][]byte{make([]byte, 32)}),
		webtransport.WithDialTimeout(200*time.Millisecond),
	)
	defer client.Close() //nolint:errcheck // always nil

	started := time.Now()
	_, err := client.Connect(t.Context(), peerURL+"/attach")
	elapsed := time.Since(started)

	if netErr, ok := errors.AsType[net.Error](err); !ok || !netErr.Timeout() {
		t.Fatalf("Connect() to a silent peer = %v, want a timeout", err)
	}

	// quic-go's default handshake timeout is 5s; finishing well before it
	// shows the option took effect.
	if elapsed > 3*time.Second {
		t.Errorf("Connect() took %v with a 200ms dial timeout", elapsed)
	}
}

func TestNewClientTreatsANilConfigAsTheDefaults(t *testing.T) {
	t.Parallel()

	client := newClient(t, webtransport.WithConfig(nil))

	if err := client.Close(); err != nil {
		t.Errorf("Close() = %v, want nil", err)
	}
}
