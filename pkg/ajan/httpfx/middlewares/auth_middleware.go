package middlewares

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/golang-jwt/jwt/v5"
)

const (
	ContextKeyAuthClaims httpfx.ContextKey = "claims"
)

var (
	ErrInvalidSigningMethod = errors.New("invalid signing method")
	ErrJWTSecretNotSet      = errors.New("JWT secret is not set")
)

// AuthOption configures AuthMiddleware.
type AuthOption func(*authConfig)

type authConfig struct {
	signingMethod *jwt.SigningMethodHMAC
	issuer        string
	audience      string
}

// WithAuthIssuer requires every token's iss claim to equal issuer. Pass
// httpfx.Config.AuthIssuer. An empty issuer leaves the check off.
func WithAuthIssuer(issuer string) AuthOption {
	return func(cfg *authConfig) {
		cfg.issuer = issuer
	}
}

// WithAuthAudience requires every token's aud claim to contain audience. Pass
// httpfx.Config.AuthAudience. An empty audience leaves the check off.
func WithAuthAudience(audience string) AuthOption {
	return func(cfg *authConfig) {
		cfg.audience = audience
	}
}

// WithAuthSigningMethod pins the HMAC method tokens must be signed with.
// The default is HS256; a nil method keeps the default.
func WithAuthSigningMethod(method *jwt.SigningMethodHMAC) AuthOption {
	return func(cfg *authConfig) {
		if method != nil {
			cfg.signingMethod = method
		}
	}
}

// AuthMiddleware accepts a request only when it carries an
// "Authorization: Bearer <jwt>" header whose token is signed with jwtSecret
// using the pinned HMAC method (HS256 unless WithAuthSigningMethod says
// otherwise) and has an exp claim in the future. With WithAuthIssuer and
// WithAuthAudience it also requires a matching iss and aud claim. The verified
// claims are stored in the request context under ContextKeyAuthClaims as
// jwt.MapClaims.
//
// An empty jwtSecret rejects every request, because an empty HMAC key would
// accept tokens anyone can sign. Missing issuer or audience checks and an
// empty secret are logged once, when the middleware is built.
func AuthMiddleware(
	logger *logfx.Logger,
	jwtSecret string,
	options ...AuthOption,
) httpfx.Handler {
	cfg := &authConfig{
		signingMethod: jwt.SigningMethodHS256,
		issuer:        "",
		audience:      "",
	}

	for _, option := range options {
		option(cfg)
	}

	if jwtSecret == "" {
		logger.Error("httpfx auth: rejecting every request", "err", ErrJWTSecretNotSet)

		return func(ctx *httpfx.Context) httpfx.Result {
			return ctx.Results.Unauthorized(httpfx.WithPlainText("Invalid token"))
		}
	}

	// Existing deployments may issue tokens without iss or aud, so these checks
	// are opt-in; the warning keeps the gap visible until they are configured.
	if cfg.issuer == "" || cfg.audience == "" {
		logger.Warn(
			"httpfx auth: set auth_issuer and auth_audience to reject tokens minted for other services",
			"issuer_checked", cfg.issuer != "",
			"audience_checked", cfg.audience != "",
		)
	}

	parser := jwt.NewParser(buildParserOptions(cfg)...)
	jwtSecretBytes := []byte(jwtSecret)

	keyFunc := func(token *jwt.Token) (any, error) {
		// WithValidMethods already pins the algorithm; this keeps the key type
		// check next to the key it hands out.
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("%w (method=%s)", ErrInvalidSigningMethod, token.Method.Alg())
		}

		return jwtSecretBytes, nil
	}

	return func(ctx *httpfx.Context) httpfx.Result {
		tokenString, hasToken := getBearerToken(ctx)

		if !hasToken {
			return ctx.Results.Unauthorized(
				httpfx.WithPlainText("No suitable authorization header found"),
			)
		}

		token, err := parser.Parse(tokenString, keyFunc)
		if errors.Is(err, jwt.ErrTokenExpired) {
			return ctx.Results.Unauthorized(httpfx.WithPlainText("Token is expired"))
		}

		if err != nil || !token.Valid {
			return ctx.Results.Unauthorized(httpfx.WithPlainText("Invalid token"))
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return ctx.Results.Unauthorized(httpfx.WithPlainText("Invalid token"))
		}

		ctx.UpdateContext(context.WithValue(
			ctx.Request.Context(),
			ContextKeyAuthClaims,
			claims,
		))

		return ctx.Next()
	}
}

func buildParserOptions(cfg *authConfig) []jwt.ParserOption {
	options := []jwt.ParserOption{
		jwt.WithValidMethods([]string{cfg.signingMethod.Alg()}),
		jwt.WithExpirationRequired(),
	}

	if cfg.issuer != "" {
		options = append(options, jwt.WithIssuer(cfg.issuer))
	}

	if cfg.audience != "" {
		options = append(options, jwt.WithAudience(cfg.audience))
	}

	return options
}

func getBearerToken(ctx *httpfx.Context) (string, bool) {
	for _, authHeader := range ctx.Request.Header["Authorization"] {
		if tokenString, ok := strings.CutPrefix(authHeader, "Bearer "); ok {
			return tokenString, true
		}
	}

	return "", false
}
