package webtransport

// BuildDialerTLSConfig exposes buildDialerTLSConfig to the webtransport_test
// package, so the pinning checks are tested without a network round trip.
var BuildDialerTLSConfig = buildDialerTLSConfig
