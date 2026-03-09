package esergo

import (
	"github.com/eser/stack/apps/services/pkg/eser-go/aifx"
	"github.com/eser/stack/apps/services/pkg/eser-go/connfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/httpclient"
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/i18nfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
)

type BaseConfig struct {
	Conn       connfx.Config `conf:"conn"`
	AI         aifx.Config   `conf:"ai"`
	AppName    string        `conf:"name"    default:"eser-go-svc"`
	AppEnv     string        `conf:"env"     default:"development"`
	AppVersion string        `conf:"version" default:"0.0.0"`

	// Security configuration
	JWTSecret string `conf:"jwt_secret"` // No default - validated at startup

	Log        logfx.Config      `conf:"log"`
	HTTP       httpfx.Config     `conf:"http"`
	HTTPClient httpclient.Config `conf:"http_client"`
	I18n       i18nfx.Config     `conf:"i18n"`
}
