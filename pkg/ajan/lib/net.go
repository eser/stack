package lib

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"strings"
)

var (
	ErrInvalidIPAddress      = errors.New("invalid IP address")
	ErrFailedToSplitHostPort = errors.New("failed to split host and port")
	ErrSSRFBlocked           = errors.New("URL resolves to a private or reserved IP address")
	ErrInvalidURL            = errors.New("invalid URL")
	ErrInsecureScheme        = errors.New("HTTPS is required")
)

// privateNetworks defines RFC 1918, RFC 5735, and RFC 4193 private/reserved CIDR ranges.
//
//nolint:gochecknoglobals
var privateNetworks []*net.IPNet

//nolint:gochecknoinits
func init() {
	cidrs := []string{
		"10.0.0.0/8",     // RFC 1918
		"172.16.0.0/12",  // RFC 1918
		"192.168.0.0/16", // RFC 1918
		"127.0.0.0/8",    // Loopback
		"169.254.0.0/16", // Link-local
		"0.0.0.0/8",      // Unspecified
		"100.64.0.0/10",  // Shared address space (RFC 6598)
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 unique local
		"fe80::/10",      // IPv6 link-local
	}

	for _, cidr := range cidrs {
		_, network, _ := net.ParseCIDR(cidr)
		privateNetworks = append(privateNetworks, network)
	}
}

func SplitHostPort(addr string) (string, string, error) {
	if !strings.ContainsRune(addr, ':') {
		return addr, "", nil
	}

	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return "", "", fmt.Errorf("%w (addr=%q): %w", ErrFailedToSplitHostPort, addr, err)
	}

	return host, port, nil
}

func DetectLocalNetwork(requestAddr string) (bool, error) {
	var requestIP string

	requestAddrs := strings.SplitN(requestAddr, ",", 2) //nolint:mnd

	requestIP, _, err := SplitHostPort(requestAddrs[0])
	if err != nil {
		return false, err
	}

	requestIPNet := net.ParseIP(requestIP)
	if requestIPNet == nil {
		return false, fmt.Errorf("%w (request_ip=%q)", ErrInvalidIPAddress, requestIP)
	}

	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return false, err //nolint:wrapcheck
	}

	for _, addr := range addrs {
		ipNet, ok := addr.(*net.IPNet)
		if !ok {
			continue
		}

		if !ipNet.Contains(requestIPNet) {
			continue
		}

		if requestIPNet.IsLoopback() {
			return true, nil
		}
	}

	return false, nil
}

// IsPrivateIP checks if the given IP string falls within private or reserved ranges.
func IsPrivateIP(ipStr string) bool {
	parsedIP := net.ParseIP(ipStr)
	if parsedIP == nil {
		return false
	}

	for _, network := range privateNetworks {
		if network.Contains(parsedIP) {
			return true
		}
	}

	return false
}

// validateURLScheme checks that the URL has a valid scheme and host, and enforces HTTPS if required.
func validateURLScheme(parsed *url.URL, requireHTTPS bool) error {
	if parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("%w: missing scheme or host", ErrInvalidURL)
	}

	if requireHTTPS && parsed.Scheme != "https" {
		return ErrInsecureScheme
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("%w: unsupported scheme %q", ErrInvalidURL, parsed.Scheme)
	}

	return nil
}

// validateHostnameIPs resolves a hostname and checks that no resolved IP is in a private range.
func validateHostnameIPs(hostname string) error {
	// Check if hostname is already an IP
	if parsedIP := net.ParseIP(hostname); parsedIP != nil {
		if IsPrivateIP(hostname) {
			return fmt.Errorf("%w: %s", ErrSSRFBlocked, hostname)
		}

		return nil
	}

	// Resolve hostname to IPs
	resolvedIPs, err := net.LookupHost(hostname)
	if err != nil {
		return fmt.Errorf("%w: failed to resolve %q: %w", ErrInvalidURL, hostname, err)
	}

	for _, ipAddr := range resolvedIPs {
		if IsPrivateIP(ipAddr) {
			return fmt.Errorf("%w: %s resolves to %s", ErrSSRFBlocked, hostname, ipAddr)
		}
	}

	return nil
}

// ValidateExternalURL validates that a URL is safe for outbound requests (SSRF prevention).
// It resolves the hostname and checks that no resolved IP is in a private/reserved range.
// If requireHTTPS is true, only https:// URLs are allowed.
func ValidateExternalURL(rawURL string, requireHTTPS bool) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrInvalidURL, err)
	}

	schemeErr := validateURLScheme(parsed, requireHTTPS)
	if schemeErr != nil {
		return schemeErr
	}

	return validateHostnameIPs(parsed.Hostname())
}
