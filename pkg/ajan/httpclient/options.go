package httpclient

import (
	"crypto/tls"
	"net/http"
	"time"
)

type NewClientOption func(*Client)

func WithConfig(config *Config) NewClientOption {
	return func(client *Client) {
		client.Config = config
	}
}

func WithTLSClientConfig(tlsConfig *tls.Config) NewClientOption {
	return func(client *Client) {
		client.TLSClientConfig = tlsConfig
	}
}

func WithRoundTripper(rt http.RoundTripper) NewClientOption {
	return func(client *Client) {
		client.innerTransport = rt
	}
}

// WithTimeout sets the timeout for HTTP requests.
// Note: This is applied after the client is created via a post-creation hook.
func WithTimeout(timeout time.Duration) NewClientOption {
	return func(client *Client) {
		client.timeout = timeout
	}
}
