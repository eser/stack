package i18nfx

// Config holds i18nfx configuration.
type Config struct {
	DefaultLocale string `conf:"default_locale" default:"en"`
	LocalesDir    string `conf:"locales_dir"    default:"etc/locales"`
}
