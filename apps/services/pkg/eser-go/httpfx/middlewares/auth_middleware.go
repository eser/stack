package middlewares

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/golang-jwt/jwt/v5"
)

const (
	ContextKeyAuthClaims httpfx.ContextKey = "claims"
)

var (
	ErrInvalidSigningMethod = errors.New("invalid signing method")
	ErrJWTSecretNotSet      = errors.New("JWT secret is not set")
)

func AuthMiddleware(jwtSecret string) httpfx.Handler {
	jwtSecretBytes := []byte(jwtSecret)

	return func(ctx *httpfx.Context) httpfx.Result {
		tokenString, hasToken := getBearerToken(ctx)

		if !hasToken {
			return ctx.Results.Unauthorized(
				httpfx.WithPlainText("No suitable authorization header found"),
			)
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf(
					"%w (method=%s)",
					ErrInvalidSigningMethod,
					token.Method.Alg(),
				)
			}

			return jwtSecretBytes, nil
		})
		if err != nil || !token.Valid {
			return ctx.Results.Unauthorized(httpfx.WithPlainText("Invalid or expired token"))
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || !token.Valid {
			return ctx.Results.Unauthorized(httpfx.WithPlainText("Invalid token"))
		}

		if exp, ok := claims["exp"].(float64); ok {
			if time.Unix(int64(exp), 0).Before(time.Now()) {
				return ctx.Results.Unauthorized(httpfx.WithPlainText("Token is expired"))
			}
		}

		ctx.UpdateContext(context.WithValue(
			ctx.Request.Context(),
			ContextKeyAuthClaims,
			claims,
		))

		return ctx.Next()
	}
}

func getBearerToken(ctx *httpfx.Context) (string, bool) {
	for _, authHeader := range ctx.Request.Header["Authorization"] {
		if after, ok := strings.CutPrefix(authHeader, "Bearer "); ok {
			tokenString := after

			return tokenString, true
		}
	}

	return "", false
}
