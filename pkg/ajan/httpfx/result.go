package httpfx

import (
	"github.com/eser/stack/pkg/ajan/results"
)

type Result struct { //nolint:errname
	results.Result

	InnerRedirectToURI string

	// InnerContentType is written as the Content-Type header when non-empty.
	//
	// Nothing carried one before, so the router wrote a body with no header at
	// all and net/http fell back to sniffing it. Go's DetectContentType does not
	// recognise JSON, so every Results.JSON response -- 85 call sites, including
	// /openapi.json -- was served as text/plain, which clients and API tooling
	// reject or mis-handle.
	//
	// Empty keeps the previous sniffing behaviour, so results that genuinely do
	// not know their type are unaffected.
	InnerContentType string

	InnerBody []byte

	InnerStatusCode int
}

func (r Result) StatusCode() int {
	return r.InnerStatusCode
}

func (r Result) Body() []byte {
	return r.InnerBody
}

// ContentType returns the Content-Type to send, or "" to let net/http sniff.
func (r Result) ContentType() string {
	return r.InnerContentType
}

func (r Result) RedirectToURI() string {
	return r.InnerRedirectToURI
}

// Content types set by the Results constructors that know what they produced.
const (
	ContentTypeJSON      = "application/json; charset=utf-8"
	ContentTypePlainText = "text/plain; charset=utf-8"
)
