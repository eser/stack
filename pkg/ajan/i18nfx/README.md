# 🌍 [ajan/i18nfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/i18nfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`i18nfx` translates message IDs into the reader's language for Go services and
server-rendered HTML. It loads TOML message files with
[go-i18n](https://github.com/nicksnyder/go-i18n), falls back to a default locale
and then to the message ID, so a missing translation never breaks a page, and it
reports the text direction (`rtl` or `ltr`) of a locale from its script.

## Quick Start

Create one message file per language in `etc/locales`. The default locale,
`etc/locales/en.toml`:

```toml
color = "Color"
greeting = "Hello"
welcome = "Welcome, {{.Name}}"
```

A British English file that overrides one message, `etc/locales/en-GB.toml`:

```toml
color = "Colour"
```

Load the directory and translate:

```go
package main

import (
	"fmt"
	"os"

	"github.com/eser/stack/pkg/ajan/i18nfx"
)

func main() {
	localizer, err := i18nfx.NewLocalizer(&i18nfx.Config{
		DefaultLocale: "en",
		LocalesDir:    "etc/locales",
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println(localizer.T("en-GB", "color"))
	fmt.Println(localizer.T("en-GB", "greeting"))
	fmt.Println(localizer.T("fr", "color"))
	fmt.Println(localizer.TWithData("en", "welcome", map[string]any{"Name": "Ada"}))
	fmt.Println(localizer.T("en", "missing.id"))
	fmt.Println(i18nfx.Dir("ar-EG"))
}
```

Run it from the directory that holds `etc/locales`, since `LocalesDir` is
relative to the working directory. It prints:

```text
Colour
Hello
Color
Welcome, Ada
missing.id
rtl
```

`en-GB` has no `greeting`, so the English text answers; there is no French file,
so `fr` gets the default locale; no file has `missing.id`, so the ID itself
comes back.

## Config

`Config` holds the two settings, with `conf` tags for
[configfx](../configfx/README.md):

```go
type Config struct {
	DefaultLocale string `conf:"default_locale" default:"en"`
	LocalesDir    string `conf:"locales_dir"    default:"etc/locales"`
}
```

- `DefaultLocale` is a BCP 47 language tag such as `en` or `pt-BR`. It answers
  every lookup the requested locale cannot, so its file should hold every
  message. `NewLocalizer` returns an error when the tag does not parse.
- `LocalesDir` is the directory of message files, relative to the working
  directory unless it is absolute. `NewLocalizer` returns an error wrapping
  `fs.ErrNotExist` when it is missing.

Embed `Config` in your own config struct to load it with configfx; under a
`conf:"i18n"` field, the keys are `i18n__default_locale` and
`i18n__locales_dir`:

```go
type AppConfig struct {
	I18n i18nfx.Config `conf:"i18n"`
}

func newLocalizer() (*i18nfx.Localizer, error) {
	config := &AppConfig{}
	manager := configfx.NewConfigManager()

	err := manager.LoadDefaults(config)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	return i18nfx.NewLocalizer(&config.I18n)
}
```

## Message Files

`NewLocalizer` reads every file with the `.toml` extension in `LocalesDir` and
skips other files and subdirectories. go-i18n takes the language from the file
name: the last dot-separated part before `.toml`, so `en.toml` and
`active.en.toml` both hold English and `en-GB.toml` holds British English. A
file that does not parse makes `NewLocalizer` return an error that names it.

A message is a key with a string, written in Go's `text/template` syntax when it
has placeholders. go-i18n also reads a table with `description` and `other`
keys:

```toml
greeting = "Hello"
welcome = "Welcome, {{.Name}}"

[items]
description = "The item count on the cart page"
other = "{{.Count}} items"
```

`TWithData` fills the placeholders from its map. `T` renders a message with no
data, so a placeholder prints `<no value>`; use `TWithData` for those messages.

## Translating With T and TWithData

```go
// func (l *Localizer) T(locale string, messageID string) string
// func (l *Localizer) TWithData(locale string, messageID string, data map[string]any) string
```

Both methods return a string and never an error. They try these sources in order
and return the first that has the message:

1. The requested locale, matched by go-i18n, so `en-GB` reads `en-GB.toml` and
   `tr-TR` reads `tr.toml` when there is no `tr-TR.toml`.
2. The default locale. It also answers when the requested locale is empty, does
   not parse, or has no message file.
3. The message ID itself, which keeps the page readable and shows which ID needs
   a translation. A template that fails to render returns the ID too.

## Text Direction With IsRTL and Dir

`IsRTL` reports whether a locale is written in a right-to-left script. It reads
the script from the BCP 47 tag, so it needs no message file for the locale.
`Dir` returns `rtl` or `ltr` for an HTML `dir` attribute.

```go
// func IsRTL(locale string) bool
// func Dir(locale string) string

i18nfx.IsRTL("ar-EG")   // true
i18nfx.IsRTL("az-Arab") // true: Azerbaijani in the Arabic script
i18nfx.IsRTL("az")      // false: Azerbaijani defaults to the Latin script
i18nfx.Dir("he")        // "rtl"
i18nfx.Dir("en")        // "ltr"
```

The right-to-left scripts are Adlam, Arabic, Hebrew, N'Ko, Hanifi Rohingya,
Syriac and Thaana, which covers `ar`, `fa`, `he`, `ur` and `dv`. A tag that does
not parse is reported as left-to-right.

## Templates With TemplateFuncMap

`TemplateFuncMap` returns an `html/template` function map with `t`, which calls
`T`, and `dir`, which calls `Dir`. Pass the locale as a template argument:

```go
// func (l *Localizer) TemplateFuncMap() template.FuncMap

page := template.Must(template.New("page").
	Funcs(localizer.TemplateFuncMap()).
	Parse(`<p dir="{{dir .Locale}}">{{t .Locale "greeting"}}</p>`))

err := page.Execute(w, map[string]string{"Locale": "en-GB"})
// <p dir="ltr">Hello</p>
```

The map has no `TWithData`; render messages with placeholders in Go and pass the
result to the template.

## Concurrency

`NewLocalizer` loads every file before it returns, and the `Localizer` never
changes its message bundle afterwards. One `Localizer` can therefore serve
concurrent requests; create it at start-up and share it.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `IsRTL` and `Dir` use the script of the BCP 47 tag, so `he`, `fa`, `ur`,
  `ar-EG`, `dv` and `az-Arab` are right-to-left (only `ar` was). `Localizer.T`
  and `TWithData` return the default locale's text for a message the requested
  locale lacks, instead of the message ID. `NewLocalizer` error prefixes are
  `parse`, `read` and `load` instead of `parsing`, `reading` and `loading`;
  match with `errors.Is`.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/i18nfx`: the API reference generated
  from source
- [go-i18n](https://github.com/nicksnyder/go-i18n): the message bundle, language
  matching and message file format underneath
- [ajan/configfx](../configfx/README.md): loads `Config` from files and the
  environment
- [eser/stack on GitHub](https://github.com/eser/stack)
