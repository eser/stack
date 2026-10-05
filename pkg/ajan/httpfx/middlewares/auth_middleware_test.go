package middlewares_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/httpfx/middlewares"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testJWTSecret   = "secret"
	testJWTIssuer   = "https://auth.example.test"
	testJWTAudience = "orders-api"
)

func signToken(t *testing.T, method jwt.SigningMethod, secret string, claims jwt.MapClaims) string {
	t.Helper()

	var key any = []byte(secret)
	if method == jwt.SigningMethodNone {
		key = jwt.UnsafeAllowNoneSignatureType
	}

	tokenString, err := jwt.NewWithClaims(method, claims).SignedString(key)
	require.NoError(t, err, "sign test token")

	return tokenString
}

// validClaims returns claims that pass every check AuthMiddleware can enable.
func validClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"sub": "user-1",
		"iss": testJWTIssuer,
		"aud": testJWTAudience,
		"exp": time.Now().Add(time.Hour).Unix(),
	}
}

func withClaim(key string, value any) jwt.MapClaims {
	claims := validClaims()
	if value == nil {
		delete(claims, key)

		return claims
	}

	claims[key] = value

	return claims
}

func newTestLogger(buf *bytes.Buffer) *logfx.Logger {
	return logfx.NewLogger(
		logfx.WithWriter(buf),
		logfx.WithConfig(&logfx.Config{ //nolint:exhaustruct
			Level: "INFO",
		}),
	)
}

func runAuth(t *testing.T, handler httpfx.Handler, header string) (httpfx.Result, *httpfx.Context) {
	t.Helper()

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	if header != "" {
		req.Header.Set("Authorization", header)
	}

	httpCtx := &httpfx.Context{ //nolint:exhaustruct
		Request:        req,
		ResponseWriter: httptest.NewRecorder(),
	}

	return handler(httpCtx), httpCtx
}

func TestAuthMiddleware(t *testing.T) { //nolint:funlen
	t.Parallel()

	strict := []middlewares.AuthOption{
		middlewares.WithAuthIssuer(testJWTIssuer),
		middlewares.WithAuthAudience(testJWTAudience),
	}

	tests := []struct {
		name     string
		options  []middlewares.AuthOption
		header   func(t *testing.T) string
		wantCode int
		wantBody string
	}{
		{
			name:     "no authorization header",
			header:   func(*testing.T) string { return "" },
			wantCode: http.StatusUnauthorized,
		},
		{
			name:     "malformed token",
			header:   func(*testing.T) string { return "Bearer InvalidToken" },
			wantCode: http.StatusUnauthorized,
		},
		{
			name: "expired token",
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret,
					withClaim("exp", time.Now().Add(-time.Hour).Unix()))
			},
			wantCode: http.StatusUnauthorized,
			wantBody: "Token is expired",
		},
		{
			name: "token without exp",
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret, withClaim("exp", nil))
			},
			wantCode: http.StatusUnauthorized,
			wantBody: "Invalid token",
		},
		{
			name: "token signed with another secret",
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, "secret2", validClaims())
			},
			wantCode: http.StatusUnauthorized,
		},
		{
			name: "token signed with an unpinned HMAC method",
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS512, testJWTSecret, validClaims())
			},
			wantCode: http.StatusUnauthorized,
		},
		{
			name: "unsigned token with alg none",
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodNone, "", validClaims())
			},
			wantCode: http.StatusUnauthorized,
		},
		{
			name:    "wrong issuer",
			options: strict,
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret,
					withClaim("iss", "https://other.example.test"))
			},
			wantCode: http.StatusUnauthorized,
		},
		{
			name:    "missing issuer while one is configured",
			options: strict,
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret, withClaim("iss", nil))
			},
			wantCode: http.StatusUnauthorized,
		},
		{
			name:    "wrong audience",
			options: strict,
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret,
					withClaim("aud", "billing-api"))
			},
			wantCode: http.StatusUnauthorized,
		},
		{
			name:    "missing audience while one is configured",
			options: strict,
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret, withClaim("aud", nil))
			},
			wantCode: http.StatusUnauthorized,
		},
		{
			name:    "valid token with issuer and audience checks",
			options: strict,
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret, validClaims())
			},
			wantCode: http.StatusNoContent,
		},
		{
			name: "valid token without issuer and audience checks",
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret,
					jwt.MapClaims{"exp": time.Now().Add(time.Hour).Unix()})
			},
			wantCode: http.StatusNoContent,
		},
		{
			name:    "pinned HS512 accepts an HS512 token",
			options: []middlewares.AuthOption{middlewares.WithAuthSigningMethod(jwt.SigningMethodHS512)},
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS512, testJWTSecret, validClaims())
			},
			wantCode: http.StatusNoContent,
		},
		{
			name:    "pinned HS512 rejects an HS256 token",
			options: []middlewares.AuthOption{middlewares.WithAuthSigningMethod(jwt.SigningMethodHS512)},
			header: func(t *testing.T) string {
				return "Bearer " + signToken(t, jwt.SigningMethodHS256, testJWTSecret, validClaims())
			},
			wantCode: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs bytes.Buffer

			handler := middlewares.AuthMiddleware(newTestLogger(&logs), testJWTSecret, tt.options...)

			result, httpCtx := runAuth(t, handler, tt.header(t))

			assert.Equal(t, tt.wantCode, result.StatusCode())

			if tt.wantBody != "" {
				assert.Equal(t, tt.wantBody, string(result.Body()))
			}

			claims, hasClaims := httpCtx.Request.Context().Value(middlewares.ContextKeyAuthClaims).(jwt.MapClaims)
			if tt.wantCode != http.StatusNoContent {
				assert.False(t, hasClaims, "rejected request must not carry claims")

				return
			}

			require.True(t, hasClaims, "claims are missing in context")
			assert.NotNil(t, claims["exp"], "exp claim is missing")
		})
	}
}

func TestAuthMiddlewareEmptySecretRejectsEveryToken(t *testing.T) {
	t.Parallel()

	var logs bytes.Buffer

	handler := middlewares.AuthMiddleware(newTestLogger(&logs), "")

	// HMAC accepts a zero-length key, so a token signed with "" verifies
	// against "" unless the middleware refuses to run without a secret.
	header := "Bearer " + signToken(t, jwt.SigningMethodHS256, "", validClaims())

	result, _ := runAuth(t, handler, header)

	assert.Equal(t, http.StatusUnauthorized, result.StatusCode())
	assert.Contains(t, logs.String(), middlewares.ErrJWTSecretNotSet.Error())
}

func TestAuthMiddlewareStartupWarning(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		options  []middlewares.AuthOption
		wantWarn bool
	}{
		{
			name:     "no issuer and no audience",
			options:  nil,
			wantWarn: true,
		},
		{
			name:     "issuer only",
			options:  []middlewares.AuthOption{middlewares.WithAuthIssuer(testJWTIssuer)},
			wantWarn: true,
		},
		{
			name: "issuer and audience",
			options: []middlewares.AuthOption{
				middlewares.WithAuthIssuer(testJWTIssuer),
				middlewares.WithAuthAudience(testJWTAudience),
			},
			wantWarn: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			var logs bytes.Buffer

			_ = middlewares.AuthMiddleware(newTestLogger(&logs), testJWTSecret, tt.options...)

			assert.Equal(t, tt.wantWarn, bytes.Contains(logs.Bytes(), []byte("auth_issuer")))
		})
	}
}
