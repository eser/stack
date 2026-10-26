package i18nfx

import (
	"errors"
	"fmt"
	"html/template"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
	"github.com/nicksnyder/go-i18n/v2/i18n"
	"golang.org/x/text/language"
)

// Localizer provides locale-aware message translation.
type Localizer struct {
	bundle        *i18n.Bundle
	defaultLocale string
}

// NewLocalizer creates a new Localizer, loading all TOML message files
// from the configured locales directory.
func NewLocalizer(config *Config) (*Localizer, error) {
	defaultLang, err := language.Parse(config.DefaultLocale)
	if err != nil {
		return nil, fmt.Errorf("parse default locale %q: %w", config.DefaultLocale, err)
	}

	bundle := i18n.NewBundle(defaultLang)
	bundle.RegisterUnmarshalFunc("toml", toml.Unmarshal)

	entries, dirErr := os.ReadDir(config.LocalesDir)
	if dirErr != nil {
		return nil, fmt.Errorf("read locales directory %q: %w", config.LocalesDir, dirErr)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		if filepath.Ext(entry.Name()) != ".toml" {
			continue
		}

		filePath := filepath.Join(config.LocalesDir, entry.Name())

		_, loadErr := bundle.LoadMessageFile(filePath)
		if loadErr != nil {
			return nil, fmt.Errorf("load message file %q: %w", filePath, loadErr)
		}
	}

	return &Localizer{
		bundle:        bundle,
		defaultLocale: config.DefaultLocale,
	}, nil
}

// T translates a message ID for the given locale.
// Falls back to the default locale, then to the message ID itself.
func (l *Localizer) T(locale string, messageID string) string {
	return l.localize(locale, &i18n.LocalizeConfig{ //nolint:exhaustruct
		MessageID: messageID,
	})
}

// TWithData translates a message ID with template data for the given locale.
// It falls back the same way as T.
func (l *Localizer) TWithData(locale string, messageID string, data map[string]any) string {
	return l.localize(locale, &i18n.LocalizeConfig{ //nolint:exhaustruct
		MessageID:    messageID,
		TemplateData: data,
	})
}

// localize resolves config for locale. A missing translation is not an error a
// caller can act on in a template, so every failure falls back to the message
// ID, which keeps the page readable and shows which ID needs a translation.
func (l *Localizer) localize(locale string, config *i18n.LocalizeConfig) string {
	localizer := i18n.NewLocalizer(l.bundle, locale, l.defaultLocale)

	msg, err := localizer.Localize(config)
	if err == nil {
		return msg
	}

	// When the locale exists but lacks this message, go-i18n returns the
	// default locale's text together with a MessageNotFoundErr. That text is
	// the documented fallback, so use it rather than the message ID.
	if _, notFound := errors.AsType[*i18n.MessageNotFoundErr](err); notFound && msg != "" {
		return msg
	}

	return config.MessageID
}

// TemplateFuncMap returns a FuncMap with "t" and "dir" functions for use
// in Go html/template rendering. The locale is passed as a template argument.
func (l *Localizer) TemplateFuncMap() template.FuncMap {
	return template.FuncMap{
		"t": func(locale string, messageID string) string {
			return l.T(locale, messageID)
		},
		"dir": Dir,
	}
}
