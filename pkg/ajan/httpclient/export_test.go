package httpclient

import "crypto/tls"

// BuildH3TLSConfig exposes buildH3TLSConfig to the httpclient_test package,
// built from the same options NewHTTP3RoundTripper takes.
func BuildH3TLSConfig(opts ...H3Option) *tls.Config {
	cfg := &h3RoundTripperConfig{} //nolint:exhaustruct

	for _, o := range opts {
		o(cfg)
	}

	return buildH3TLSConfig(cfg)
}
