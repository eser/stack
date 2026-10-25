package aifx

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/eser/stack/pkg/ajan/lib"
)

// Google access tokens for Vertex AI, from the credential sources Application
// Default Credentials reads, in its order:
//
//  1. the JSON file GOOGLE_APPLICATION_CREDENTIALS names,
//  2. gcloud's file: $HOME/.config/gcloud/application_default_credentials.json
//     (%APPDATA%\gcloud\application_default_credentials.json on Windows),
//  3. the metadata server of Google Cloud compute (GCE_METADATA_HOST, or the
//     metadata address when it answers).
//
// A file may hold a service account key ("service_account", exchanged for a
// token through a signed JWT) or gcloud user credentials ("authorized_user",
// exchanged through the refresh token). Other types, such as workload identity
// federation ("external_account") and impersonation, are reported as
// unsupported. The quota project comes from GOOGLE_CLOUD_QUOTA_PROJECT, else
// from the file's quota_project_id, and is sent as X-Goog-User-Project.

const (
	googleCloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform"
	googleDefaultTokenURL    = "https://oauth2.googleapis.com/token"
	googleMetadataIP         = "169.254.169.254"
	googleJWTBearerGrant     = "urn:ietf:params:oauth:grant-type:jwt-bearer"

	// googleTokenEarlyExpiry refreshes a token this long before it expires,
	// as the Google auth library does.
	googleTokenEarlyExpiry = 225 * time.Second

	googleTokenLifetime       = time.Hour
	googleTokenRequestTimeout = 30 * time.Second
	googleMetadataProbeWait   = 2 * time.Second
	googleTokenMaxBytes       = 1 << 20
	googleCredentialsMaxBytes = 1 << 20
	googleTokenErrorBodyBytes = 512
)

var (
	// ErrGoogleCredentialsNotFound reports that no credential source is set.
	ErrGoogleCredentialsNotFound = errors.New("no Google credentials found")

	// ErrGoogleCredentialsInvalid reports a credential file that cannot be used.
	ErrGoogleCredentialsInvalid = errors.New("invalid Google credentials")

	// ErrGoogleTokenFetch reports a failed access token exchange.
	ErrGoogleTokenFetch = errors.New("fetch Google access token")
)

// googleToken is an access token and when it expires; a zero expiry never does.
type googleToken struct {
	expiry time.Time
	value  string
}

// googleCredentials hands out a cached access token for one credential source.
type googleCredentials struct {
	client       *http.Client
	fetch        func(ctx context.Context, client *http.Client) (*googleToken, error)
	token        *googleToken
	now          func() time.Time
	quotaProject string
	mu           sync.Mutex
}

// accessToken returns the cached token, fetching a new one when it is missing
// or about to expire. Concurrent callers wait for one fetch.
func (c *googleCredentials) accessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := c.now()

	if c.token != nil && (c.token.expiry.IsZero() || now.Add(googleTokenEarlyExpiry).Before(c.token.expiry)) {
		return c.token.value, nil
	}

	fetchCtx, cancel := context.WithTimeout(ctx, googleTokenRequestTimeout)
	defer cancel()

	token, err := c.fetch(fetchCtx, c.client)
	if err != nil {
		return "", err
	}

	c.token = token

	return token.value, nil
}

// authorize sets the bearer token and the quota project on a request.
func (c *googleCredentials) authorize(ctx context.Context, req *http.Request) error {
	token, err := c.accessToken(ctx)
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+token)

	if c.quotaProject != "" {
		req.Header.Set("X-Goog-User-Project", c.quotaProject)
	}

	return nil
}

// googleCredentialsFile is the part of a credentials JSON file aifx reads.
type googleCredentialsFile struct {
	Type           string `json:"type"`
	ClientEmail    string `json:"client_email"`
	PrivateKey     string `json:"private_key"`
	PrivateKeyID   string `json:"private_key_id"`
	TokenURI       string `json:"token_uri"`
	ClientID       string `json:"client_id"`
	ClientSecret   string `json:"client_secret"`
	RefreshToken   string `json:"refresh_token"`
	QuotaProjectID string `json:"quota_project_id"`
}

// detectGoogleCredentials finds the first credential source, in the order of
// Application Default Credentials.
func detectGoogleCredentials(ctx context.Context, client *http.Client) (*googleCredentials, error) {
	if path := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"); path != "" {
		return googleCredentialsFromFile(path, client)
	}

	if path := googleWellKnownFile(); path != "" {
		if _, err := os.Stat(path); err == nil {
			return googleCredentialsFromFile(path, client)
		}
	}

	if host := os.Getenv("GCE_METADATA_HOST"); host != "" {
		return googleMetadataCredentials(host, client), nil
	}

	if probeGoogleMetadataServer(ctx, client) {
		return googleMetadataCredentials(googleMetadataIP, client), nil
	}

	return nil, fmt.Errorf(
		"%w: set GOOGLE_APPLICATION_CREDENTIALS to a service account key, run "+
			"`gcloud auth application-default login`, run on Google Cloud, or configure an API key",
		ErrGoogleCredentialsNotFound,
	)
}

// googleWellKnownFile is where gcloud writes application default credentials.
func googleWellKnownFile() string {
	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		if appData == "" {
			return ""
		}

		return filepath.Join(appData, "gcloud", "application_default_credentials.json")
	}

	home := os.Getenv("HOME")
	if home == "" {
		var err error

		home, err = os.UserHomeDir()
		if err != nil {
			return ""
		}
	}

	return filepath.Join(home, ".config", "gcloud", "application_default_credentials.json")
}

func googleCredentialsFromFile(path string, client *http.Client) (*googleCredentials, error) {
	file, err := os.Open(path) //nolint:gosec // G304: the path is the operator's credentials setting
	if err != nil {
		return nil, fmt.Errorf("%w: open credentials file %q: %w", ErrGoogleCredentialsInvalid, path, err)
	}

	defer func() { _ = file.Close() }()

	raw, err := lib.ReadAllLimited(file, googleCredentialsMaxBytes)
	if err != nil {
		return nil, fmt.Errorf("%w: read credentials file %q: %w", ErrGoogleCredentialsInvalid, path, err)
	}

	credentials, err := googleCredentialsFromJSON(raw, client, googleDefaultTokenURL)
	if err != nil {
		return nil, fmt.Errorf("credentials file %q: %w", path, err)
	}

	return credentials, nil
}

// googleCredentialsFromJSON reads a service account key or gcloud user
// credentials. userTokenURL is where user credentials are refreshed.
func googleCredentialsFromJSON(raw []byte, client *http.Client, userTokenURL string) (*googleCredentials, error) {
	var file googleCredentialsFile

	err := json.Unmarshal(raw, &file)
	if err != nil {
		return nil, fmt.Errorf("%w: the file is not JSON: %w", ErrGoogleCredentialsInvalid, err)
	}

	quotaProject := os.Getenv("GOOGLE_CLOUD_QUOTA_PROJECT")
	if quotaProject == "" {
		quotaProject = file.QuotaProjectID
	}

	credentials := &googleCredentials{
		client:       client,
		fetch:        nil,
		token:        nil,
		now:          time.Now,
		quotaProject: quotaProject,
		mu:           sync.Mutex{},
	}

	switch file.Type {
	case "service_account":
		fetch, err := serviceAccountTokenFetcher(&file)
		if err != nil {
			return nil, err
		}

		credentials.fetch = fetch
	case "authorized_user":
		if file.ClientID == "" || file.ClientSecret == "" || file.RefreshToken == "" {
			return nil, fmt.Errorf(
				"%w: authorized_user credentials need client_id, client_secret and refresh_token; "+
					"run `gcloud auth application-default login` again",
				ErrGoogleCredentialsInvalid,
			)
		}

		credentials.fetch = func(ctx context.Context, client *http.Client) (*googleToken, error) {
			return postTokenRequest(ctx, client, userTokenURL, url.Values{
				"client_id":     {file.ClientID},
				"client_secret": {file.ClientSecret},
				"grant_type":    {"refresh_token"},
				"refresh_token": {file.RefreshToken},
			})
		}
	default:
		return nil, fmt.Errorf(
			"%w: credential type %q is not supported; use a service_account key, "+
				"authorized_user credentials from gcloud, the metadata server or an API key",
			ErrGoogleCredentialsInvalid, file.Type,
		)
	}

	return credentials, nil
}

// serviceAccountTokenFetcher exchanges a JWT signed with the service account
// key for an access token (RFC 7523), the flow the Google auth library uses.
func serviceAccountTokenFetcher(
	file *googleCredentialsFile,
) (func(ctx context.Context, client *http.Client) (*googleToken, error), error) {
	if file.ClientEmail == "" || file.PrivateKey == "" {
		return nil, fmt.Errorf(
			"%w: a service_account key needs client_email and private_key", ErrGoogleCredentialsInvalid,
		)
	}

	key, err := parseRSAPrivateKey(file.PrivateKey)
	if err != nil {
		return nil, err
	}

	tokenURL := file.TokenURI
	if tokenURL == "" {
		tokenURL = googleDefaultTokenURL
	}

	return func(ctx context.Context, client *http.Client) (*googleToken, error) {
		assertion, err := signServiceAccountJWT(key, file.PrivateKeyID, file.ClientEmail, tokenURL, time.Now())
		if err != nil {
			return nil, err
		}

		return postTokenRequest(ctx, client, tokenURL, url.Values{
			"grant_type": {googleJWTBearerGrant},
			"assertion":  {assertion},
		})
	}, nil
}

func parseRSAPrivateKey(encoded string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(encoded))
	if block == nil {
		return nil, fmt.Errorf("%w: private_key is not a PEM block", ErrGoogleCredentialsInvalid)
	}

	if key, err := x509.ParsePKCS8PrivateKey(block.Bytes); err == nil {
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("%w: private_key is not an RSA key", ErrGoogleCredentialsInvalid)
		}

		return rsaKey, nil
	}

	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("%w: private_key is neither a PKCS #8 nor a PKCS #1 RSA key: %w",
			ErrGoogleCredentialsInvalid, err)
	}

	return key, nil
}

// signServiceAccountJWT builds the RS256 assertion of the token exchange,
// valid for an hour from now.
func signServiceAccountJWT(key *rsa.PrivateKey, keyID, email, audience string, now time.Time) (string, error) {
	header := struct {
		Algorithm string `json:"alg"`
		Type      string `json:"typ"`
		KeyID     string `json:"kid,omitempty"`
	}{Algorithm: "RS256", Type: "JWT", KeyID: keyID}

	claims := struct {
		Issuer   string `json:"iss"`
		Scope    string `json:"scope"`
		Audience string `json:"aud"`
		Expiry   int64  `json:"exp"`
		IssuedAt int64  `json:"iat"`
	}{
		Issuer:   email,
		Scope:    googleCloudPlatformScope,
		Audience: audience,
		Expiry:   now.Add(googleTokenLifetime).Unix(),
		IssuedAt: now.Unix(),
	}

	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", fmt.Errorf("encode JWT header: %w", err)
	}

	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("encode JWT claims: %w", err)
	}

	signingInput := base64.RawURLEncoding.EncodeToString(headerJSON) + "." +
		base64.RawURLEncoding.EncodeToString(claimsJSON)

	digest := sha256.Sum256([]byte(signingInput))

	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		return "", fmt.Errorf("sign JWT assertion: %w", err)
	}

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

// googleMetadataCredentials reads tokens of the attached service account from
// the metadata server at host.
func googleMetadataCredentials(host string, client *http.Client) *googleCredentials {
	tokenURL := (&url.URL{ //nolint:exhaustruct
		Scheme:   "http",
		Host:     host,
		Path:     "/computeMetadata/v1/instance/service-accounts/default/token",
		RawQuery: url.Values{"scopes": {googleCloudPlatformScope}}.Encode(),
	}).String()

	return &googleCredentials{
		client: client,
		fetch: func(ctx context.Context, client *http.Client) (*googleToken, error) {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, tokenURL, nil)
			if err != nil {
				return nil, fmt.Errorf("%w: build metadata request: %w", ErrGoogleTokenFetch, err)
			}

			req.Header.Set("Metadata-Flavor", "Google")

			return doTokenRequest(client, req, "the metadata server")
		},
		token:        nil,
		now:          time.Now,
		quotaProject: os.Getenv("GOOGLE_CLOUD_QUOTA_PROJECT"),
		mu:           sync.Mutex{},
	}
}

// probeGoogleMetadataServer reports whether the metadata server answers, as it
// does only on Google Cloud compute.
func probeGoogleMetadataServer(ctx context.Context, client *http.Client) bool {
	probeCtx, cancel := context.WithTimeout(ctx, googleMetadataProbeWait)
	defer cancel()

	req, err := http.NewRequestWithContext(probeCtx, http.MethodGet, "http://"+googleMetadataIP, nil)
	if err != nil {
		return false
	}

	resp, err := client.Do(req) //nolint:gosec // G704: the fixed metadata address, not a caller's URL
	if err != nil {
		return false
	}

	defer closeResponse(resp)

	return resp.Header.Get("Metadata-Flavor") == "Google"
}

func postTokenRequest(ctx context.Context, client *http.Client, tokenURL string, form url.Values) (*googleToken, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("%w: build token request: %w", ErrGoogleTokenFetch, err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	return doTokenRequest(client, req, "the token endpoint")
}

// doTokenRequest sends a token request and reads the access token. An error
// names the endpoint and the status and quotes the start of the reply, which
// for a refused exchange is the OAuth error and its description; neither the
// request's secrets nor a token are ever part of it.
func doTokenRequest(client *http.Client, req *http.Request, endpoint string) (*googleToken, error) {
	resp, err := client.Do(req) //nolint:gosec // G704: the credential's own token endpoint
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrGoogleTokenFetch, err)
	}

	defer closeResponse(resp)

	body, err := lib.ReadAllLimited(resp.Body, googleTokenMaxBytes)
	if err != nil {
		return nil, fmt.Errorf("%w: read the reply of %s: %w", ErrGoogleTokenFetch, endpoint, err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		excerpt := body
		if len(excerpt) > googleTokenErrorBodyBytes {
			excerpt = excerpt[:googleTokenErrorBodyBytes]
		}

		return nil, fmt.Errorf("%w: %s answered %s: %s", ErrGoogleTokenFetch, endpoint, resp.Status, excerpt)
	}

	var reply struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}

	err = json.Unmarshal(body, &reply)
	if err != nil {
		return nil, fmt.Errorf("%w: the reply of %s is not JSON: %w", ErrGoogleTokenFetch, endpoint, err)
	}

	if reply.AccessToken == "" {
		return nil, fmt.Errorf("%w: the reply of %s has no access_token", ErrGoogleTokenFetch, endpoint)
	}

	token := &googleToken{expiry: time.Time{}, value: reply.AccessToken}
	if reply.ExpiresIn > 0 {
		token.expiry = time.Now().Add(time.Duration(reply.ExpiresIn) * time.Second)
	}

	return token, nil
}
