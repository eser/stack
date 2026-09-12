package httpfx

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
)

// Forwarded-address headers. Any client can set these, so they are only read
// when the immediate peer is inside the trusted-proxy allowlist.
const (
	XForwardedForHeader = "X-Forwarded-For"
	XRealIPHeader       = "X-Real-IP"
	TrueClientIPHeader  = "True-Client-IP"
)

var ErrInvalidTrustedProxy = errors.New("invalid trusted proxy entry")

// TrustedProxies is an allowlist of proxy addresses whose forwarded headers may
// be believed. A nil or empty allowlist trusts nobody, which leaves the socket
// peer as the only authority on the client address — the correct default for a
// daemon that is reachable directly.
type TrustedProxies struct {
	networks []*net.IPNet
}

// NewTrustedProxies compiles an allowlist from CIDR blocks ("10.0.0.0/8",
// "::1/128") or single addresses ("192.168.1.5"). Blank entries are skipped and
// an empty result is a valid empty allowlist, not an error.
func NewTrustedProxies(entries []string) (*TrustedProxies, error) {
	networks := make([]*net.IPNet, 0, len(entries))

	for _, rawEntry := range entries {
		entry := strings.TrimSpace(rawEntry)
		if entry == "" {
			continue
		}

		_, network, err := net.ParseCIDR(entry)
		if err == nil {
			networks = append(networks, network)

			continue
		}

		ip := net.ParseIP(entry)
		if ip == nil {
			return nil, fmt.Errorf("%w (entry=%q)", ErrInvalidTrustedProxy, entry)
		}

		networks = append(networks, singleHostNetwork(ip))
	}

	return &TrustedProxies{networks: networks}, nil
}

// IsEmpty reports whether the allowlist trusts nobody.
func (tp *TrustedProxies) IsEmpty() bool {
	return tp == nil || len(tp.networks) == 0
}

// Contains reports whether ip belongs to a trusted proxy network.
func (tp *TrustedProxies) Contains(ip net.IP) bool {
	if tp == nil || ip == nil {
		return false
	}

	for _, network := range tp.networks {
		if network.Contains(ip) {
			return true
		}
	}

	return false
}

// ClientIP returns the client address as a bare IP with no port. Forwarded
// headers are consulted only when the immediate peer is a trusted proxy, so an
// empty allowlist reduces this to the host part of RemoteAddr.
func (tp *TrustedProxies) ClientIP(req *http.Request) string {
	ip, _ := tp.resolve(req)

	return ip
}

// ClientAddr behaves like ClientIP but returns RemoteAddr verbatim (host:port)
// when no forwarded header was used, for callers that log or match on the full
// socket address. Forwarded hops carry no port and are returned as bare IPs.
func (tp *TrustedProxies) ClientAddr(req *http.Request) string {
	ip, forwarded := tp.resolve(req)
	if forwarded {
		return ip
	}

	return req.RemoteAddr
}

// resolve returns the client IP and whether it came from a forwarded header.
func (tp *TrustedProxies) resolve(req *http.Request) (string, bool) {
	peer := peerIP(req.RemoteAddr)

	if tp.IsEmpty() || !tp.Contains(net.ParseIP(peer)) {
		return peer, false
	}

	if hop, ok := tp.forwardedForHop(req); ok {
		return hop, true
	}

	// Single-valued headers carry no chain to walk, so they are believed only
	// after X-Forwarded-For has yielded nothing.
	for _, header := range []string{TrueClientIPHeader, XRealIPHeader} {
		if hop := normalizeIP(req.Header.Get(header)); hop != "" {
			return hop, true
		}
	}

	return peer, false
}

// forwardedForHop walks X-Forwarded-For right to left and returns the first hop
// outside the allowlist — the nearest address the trusted chain vouches for.
// Left-most elements are written by the original caller and are never taken.
func (tp *TrustedProxies) forwardedForHop(req *http.Request) (string, bool) {
	var hops []string

	for _, value := range req.Header.Values(XForwardedForHeader) {
		for entry := range strings.SplitSeq(value, ",") {
			if hop := normalizeIP(entry); hop != "" {
				hops = append(hops, hop)
			}
		}
	}

	if len(hops) == 0 {
		return "", false
	}

	for i := len(hops) - 1; i >= 0; i-- {
		if !tp.Contains(net.ParseIP(hops[i])) {
			return hops[i], true
		}
	}

	// Every hop is a trusted proxy; the outermost one is as far back as the
	// chain goes.
	return hops[0], true
}

func singleHostNetwork(ip net.IP) *net.IPNet {
	if ipv4 := ip.To4(); ipv4 != nil {
		return &net.IPNet{IP: ipv4, Mask: net.CIDRMask(net.IPv4len*8, net.IPv4len*8)}
	}

	return &net.IPNet{IP: ip, Mask: net.CIDRMask(net.IPv6len*8, net.IPv6len*8)}
}

// peerIP extracts the host part of a socket address, falling back to the raw
// value for forms net.SplitHostPort cannot parse (e.g. zone-carrying IPv6).
func peerIP(remoteAddr string) string {
	if ip := normalizeIP(remoteAddr); ip != "" {
		return ip
	}

	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return strings.TrimSpace(remoteAddr)
	}

	return strings.TrimSpace(host)
}

// normalizeIP accepts "ip", "ip:port" and "[ip]:port" and returns the canonical
// textual IP, or "" when the value is not an address.
func normalizeIP(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	if ip := net.ParseIP(trimmed); ip != nil {
		return ip.String()
	}

	host, _, err := net.SplitHostPort(trimmed)
	if err != nil {
		return ""
	}

	if ip := net.ParseIP(strings.TrimSpace(host)); ip != nil {
		return ip.String()
	}

	return ""
}
