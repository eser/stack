// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// The remote pack registry `noskills pack search` reads from
// noskills.packRegistry (pack/registry.ts). The URL comes from the
// repository, so before any request it must use https (http only for a
// loopback host), carry no credentials, and not name an internal address.
// The TypeScript client cannot check the address a host name resolves to;
// this one refuses internal addresses when it dials, so a name that
// resolves to one is refused too. Redirects are refused, the body is read
// up to MaxRegistryBytes and only a registry document is accepted.

const (
	// MaxRegistryBytes is the largest registry document read.
	MaxRegistryBytes = 1024 * 1024
	// MaxRegistryEntries is the most entries a registry may list.
	MaxRegistryEntries = 10_000
	// RegistryTimeout bounds the whole request.
	RegistryTimeout = 30 * time.Second
)

// PackRegistryError is a registry URL that was refused, or a registry that
// could not be read.
type PackRegistryError struct {
	URL     string
	Message string
	Cause   error
}

func (e *PackRegistryError) Error() string { return e.Message }

func (e *PackRegistryError) Unwrap() error { return e.Cause }

var ipv4Text = regexp.MustCompile(`^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$`) //nolint:gochecknoglobals // compiled once

func parseIPv4Octets(text string) ([]int, bool) {
	match := ipv4Text.FindStringSubmatch(text)
	if match == nil {
		return nil, false
	}

	octets := make([]int, 4)

	for i := range octets {
		n, _ := strconv.Atoi(match[i+1])
		if n > 255 {
			return nil, false
		}

		octets[i] = n
	}

	return octets, true
}

func ipv4Kind(o []int) string {
	a, b, c := o[0], o[1], o[2]

	switch {
	case a == 127:
		return "loopback"
	case a == 0:
		return "unspecified"
	case a == 10, a == 172 && b >= 16 && b <= 31, a == 192 && b == 168:
		return "private"
	case a == 100 && b >= 64 && b <= 127:
		return "shared"
	case a == 169 && b == 254:
		return "link-local"
	case a == 192 && b == 0 && c == 0, a == 198 && (b == 18 || b == 19):
		return "reserved"
	case a >= 224 && a <= 239:
		return "multicast"
	case a >= 240:
		return "reserved"
	default:
		return ""
	}
}

func ipv6Kind(addr netip.Addr) string {
	g := addr.As16()
	group := func(i int) int { return int(g[2*i])<<8 | int(g[2*i+1]) }
	embedded := []int{int(g[12]), int(g[13]), int(g[14]), int(g[15])}
	firstFiveZero := group(0) == 0 && group(1) == 0 && group(2) == 0 && group(3) == 0 && group(4) == 0

	if firstFiveZero && group(5) == 0 && group(6) == 0 {
		switch group(7) {
		case 0:
			return "unspecified"
		case 1:
			return "loopback"
		}
	}

	switch {
	case firstFiveZero && (group(5) == 0xffff || group(5) == 0):
		return ipv4Kind(embedded)
	case group(0) == 0x64 && group(1) == 0xff9b && group(2) == 0 && group(3) == 0 && group(4) == 0:
		return ipv4Kind(embedded)
	case group(0)&0xfe00 == 0xfc00:
		return "private"
	case group(0)&0xffc0 == 0xfe80:
		return "link-local"
	case group(0)&0xffc0 == 0xfec0:
		return "private"
	case group(0)&0xff00 == 0xff00:
		return "multicast"
	default:
		return ""
	}
}

// InternalAddressKind is internalAddressKind: what kind of internal address
// a URL host names ("loopback", "private", "shared", "link-local",
// "unspecified", "multicast" or "reserved"), or "" for a public address and
// for every host name.
func InternalAddressKind(hostname string) string {
	host := strings.TrimSuffix(strings.ToLower(hostname), ".")
	if host == "localhost" {
		return "loopback"
	}

	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		addr, err := netip.ParseAddr(host[1 : len(host)-1])
		if err != nil || !addr.Is6() || addr.Zone() != "" {
			return ""
		}

		return ipv6Kind(addr)
	}

	if octets, ok := parseIPv4Octets(host); ok {
		return ipv4Kind(octets)
	}

	return ""
}

func addressKind(addr netip.Addr) string {
	addr = addr.WithZone("")
	if addr.Is4() {
		b := addr.As4()

		return ipv4Kind([]int{int(b[0]), int(b[1]), int(b[2]), int(b[3])})
	}

	return ipv6Kind(addr)
}

// ParseRegistryURL is parseRegistryUrl: it checks noskills.packRegistry.
func ParseRegistryURL(value any) (*url.URL, error) {
	text, isString := value.(string)
	if !isString {
		return nil, &PackRegistryError{URL: jsString(value), Cause: nil,
			Message: "packRegistry in .eser/manifest.yml must be a URL string, got " + jsTypeOf(value)}
	}

	u, err := url.Parse(text)
	if err != nil || !u.IsAbs() || u.Host == "" {
		return nil, &PackRegistryError{URL: text, Cause: nil, Message: `packRegistry "` + text +
			`" is not an absolute URL; expected one like https://packs.example.com/registry.json`}
	}

	if u.User != nil {
		withoutCredentials := u.Scheme + "://" + u.Host + u.EscapedPath()

		return nil, &PackRegistryError{URL: withoutCredentials, Cause: nil,
			Message: "packRegistry " + withoutCredentials + " must not contain a user name or password"}
	}

	kind := InternalAddressKind(urlHostname(u))
	loopback := kind == "loopback"

	if u.Scheme != "https" && (u.Scheme != "http" || !loopback) {
		return nil, &PackRegistryError{URL: text, Cause: nil, Message: "packRegistry " + text +
			" must use https:// (http:// is allowed only for localhost, 127.0.0.1 or [::1])"}
	}

	if kind != "" && !loopback {
		return nil, &PackRegistryError{URL: text, Cause: nil, Message: "packRegistry " + text + " points at a " + kind +
			" address; noskills does not send requests to internal addresses"}
	}

	return u, nil
}

// urlHostname is the URL's host as JavaScript's URL.hostname gives it: an
// IPv6 address in brackets.
func urlHostname(u *url.URL) string {
	host := u.Hostname()
	if strings.Contains(host, ":") {
		return "[" + host + "]"
	}

	return host
}

func jsTypeOf(value any) string {
	switch value.(type) {
	case nil:
		return "object"
	case bool:
		return "boolean"
	case float64, int:
		return "number"
	case string:
		return "string"
	default:
		return "object"
	}
}

var errInternalAddress = errors.New("noskills does not send requests to internal addresses")

// NewRegistryClient is the HTTP client for a checked registry URL: it
// refuses redirects, and dials only public addresses, or only loopback ones
// when the URL names a loopback host.
func NewRegistryClient(u *url.URL) *http.Client {
	allowLoopback := InternalAddressKind(urlHostname(u)) == "loopback"

	dialer := &net.Dialer{ //nolint:exhaustruct // the defaults, plus the address check
		Timeout: RegistryTimeout,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return fmt.Errorf("dial %s: %w", address, err)
			}

			addr, err := netip.ParseAddr(host)
			if err != nil {
				return fmt.Errorf("dial %s: %w", address, err)
			}

			kind := addressKind(addr)

			switch {
			case allowLoopback && kind == "loopback":
				return nil
			case allowLoopback || kind != "":
				return fmt.Errorf("dial %s, a %s address: %w", address, kindOrPublic(kind), errInternalAddress)
			default:
				return nil
			}
		},
	}

	transport := &http.Transport{ //nolint:exhaustruct // the defaults, without a proxy that would hide the address
		DialContext:         dialer.DialContext,
		TLSHandshakeTimeout: RegistryTimeout,
		ForceAttemptHTTP2:   true,
	}

	return &http.Client{ //nolint:exhaustruct // the defaults, without redirects
		Transport:     transport,
		Timeout:       RegistryTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

func kindOrPublic(kind string) string {
	if kind == "" {
		return "public"
	}

	return kind
}

// PackRegistryEntry is one pack of a registry document.
type PackRegistryEntry struct {
	Name, Description, Version, Source string
	Tags                               []string
}

func hasControlCharacter(text string) bool {
	for _, r := range text {
		if r < 0x20 || (r >= 0x7f && r <= 0x9f) {
			return true
		}
	}

	return false
}

func isRegistryText(value any) bool {
	s, ok := value.(string)

	return ok && !hasControlCharacter(s)
}

func registryEntryProblem(entry any) string {
	o, ok := entry.(*JSObject)
	if !ok {
		return "must be an object"
	}

	if !isRegistryText(o.getOr("name")) || o.str("name") == "" {
		return "name must be a non-empty string without control characters"
	}

	for _, key := range []string{"description", "version"} {
		if !isRegistryText(o.getOr(key)) {
			return key + " must be a string without control characters"
		}
	}

	switch o.str("source") {
	case "builtin", "local", "remote":
	default:
		return "source must be one of builtin, local, remote"
	}

	if tags, present := o.get("tags"); present {
		items, isList := tags.([]any)
		if !isList {
			return "tags must be a list of strings without control characters"
		}

		for _, tag := range items {
			if !isRegistryText(tag) {
				return "tags must be a list of strings without control characters"
			}
		}
	}

	if specifier, present := o.get("specifier"); present && !isRegistryText(specifier) {
		return "specifier must be a string without control characters"
	}

	return ""
}

// ParseRegistry is parseRegistry: the entries of a registry document.
func ParseRegistry(data any) ([]PackRegistryEntry, string) {
	o, _ := data.(*JSObject)

	packs, isList := o.getOr("packs").([]any)
	if !isList {
		return nil, `the document has no "packs" list`
	}

	if len(packs) > MaxRegistryEntries {
		return nil, "it lists " + strconv.Itoa(len(packs)) + " packs; the limit is " + strconv.Itoa(MaxRegistryEntries)
	}

	entries := make([]PackRegistryEntry, 0, len(packs))

	for i, pack := range packs {
		if problem := registryEntryProblem(pack); problem != "" {
			return nil, "packs[" + strconv.Itoa(i) + "]." + problem
		}

		p, _ := pack.(*JSObject)
		entries = append(entries, PackRegistryEntry{
			Name: p.str("name"), Description: p.str("description"), Version: p.str("version"),
			Source: p.str("source"), Tags: stringsOf(p.arr("tags")),
		})
	}

	return entries, ""
}

// FetchRegistry fetches and checks the registry at a URL ParseRegistryURL
// accepted. Every failure names the URL and the cause.
func FetchRegistry(ctx context.Context, client *http.Client, u *url.URL) ([]PackRegistryEntry, error) {
	href := u.String()
	fail := func(message string, cause error) error {
		return &PackRegistryError{URL: href, Message: "pack registry " + href + ": " + message, Cause: cause}
	}

	ctx, cancel := context.WithTimeout(ctx, RegistryTimeout)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, href, nil)
	if err != nil {
		return nil, fail("the request failed: "+err.Error(), err)
	}

	request.Header.Set("Accept", "application/json")

	response, err := client.Do(request)
	if err != nil {
		return nil, fail("the request failed: "+err.Error(), err)
	}
	defer func() { _ = response.Body.Close() }()

	if response.StatusCode >= 300 && response.StatusCode < 400 {
		location := response.Header.Get("Location")
		if location == "" {
			location = "an unnamed location"
		}

		return nil, fail("redirects to "+location+"; set packRegistry to the final URL if you trust it", nil)
	}

	if response.StatusCode < 200 || response.StatusCode > 299 {
		return nil, fail("answered HTTP "+strconv.Itoa(response.StatusCode), nil)
	}

	tooLarge := "the document is larger than " + strconv.Itoa(MaxRegistryBytes) + " bytes"
	if response.ContentLength > MaxRegistryBytes {
		return nil, fail(tooLarge, nil)
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, MaxRegistryBytes+1))
	if err != nil {
		return nil, fail("the request failed: "+err.Error(), err)
	}

	if len(body) > MaxRegistryBytes {
		return nil, fail(tooLarge, nil)
	}

	data, err := parseJSON(string(body))
	if err != nil {
		return nil, fail("the document is not JSON", err)
	}

	entries, problem := ParseRegistry(data)
	if problem != "" {
		return nil, fail("the document is not a pack registry: "+problem, nil)
	}

	return entries, nil
}

// FetchPackURL is the PackFetcher of remote packs: a GET with a timeout and
// a bounded body. The host is fixed (raw.githubusercontent.com).
func FetchPackURL(client *http.Client) PackFetcher {
	return func(ctx context.Context, target string) (int, string, error) {
		ctx, cancel := context.WithTimeout(ctx, RegistryTimeout)
		defer cancel()

		request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			return 0, "", fmt.Errorf("fetch %s: %w", target, err)
		}

		response, err := client.Do(request)
		if err != nil {
			return 0, "", fmt.Errorf("fetch %s: %w", target, err)
		}
		defer func() { _ = response.Body.Close() }()

		body, err := io.ReadAll(io.LimitReader(response.Body, MaxRegistryBytes+1))
		if err != nil {
			return 0, "", fmt.Errorf("read %s: %w", target, err)
		}

		if len(body) > MaxRegistryBytes {
			return 0, "", fmt.Errorf("%s is larger than %d bytes: %w", target, MaxRegistryBytes, errPackFileTooLarge)
		}

		return response.StatusCode, string(body), nil
	}
}

var errPackFileTooLarge = errors.New("pack file too large")
