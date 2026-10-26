// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"embed"
	"net/http"
	"strings"
)

// The browser scripts, the stylesheet and the PWA files are embedded. Files
// under pkg/ajan are snake_case, so the URLs the pages use (the TypeScript
// file names) map to the embedded names here, and only these files are
// served.

//go:embed web/static
var dashboardStaticFiles embed.FS

// dashboardStaticAsset is an embedded file and its content type.
type dashboardStaticAsset struct {
	file        string
	contentType string
}

// Content types of the static files, as the TypeScript server sent them.
const (
	contentTypeJS   = "application/javascript"
	contentTypeCSS  = "text/css"
	contentTypeJSON = "application/json"
	contentTypeSVG  = "image/svg+xml"
)

// dashboardStaticAssets maps a path under /static/ to its embedded file.
func dashboardStaticAssets() map[string]dashboardStaticAsset {
	return map[string]dashboardStaticAsset{
		"client.js":      {file: "web/static/client.js", contentType: contentTypeJS},
		"mux-render.js":  {file: "web/static/mux_render.js", contentType: contentTypeJS},
		"mux-remote.js":  {file: "web/static/mux_remote.js", contentType: contentTypeJS},
		"sw-register.js": {file: "web/static/sw_register.js", contentType: contentTypeJS},
		"sw.js":          {file: "web/static/sw.js", contentType: contentTypeJS},
		"style.css":      {file: "web/static/style.css", contentType: contentTypeCSS},
		"manifest.json":  {file: "web/static/manifest.json", contentType: contentTypeJSON},
		"icons/icon.svg": {file: "web/static/icons/icon.svg", contentType: contentTypeSVG},
	}
}

// serveStatic answers with the asset at name (a path under /static/), or
// 404 for any other name.
func (d *Dashboard) serveStatic(w http.ResponseWriter, name string) {
	asset, ok := d.static[strings.TrimPrefix(name, "/")]
	if !ok {
		writeNotFound(w)

		return
	}

	content, err := dashboardStaticFiles.ReadFile(asset.file)
	if err != nil {
		writeNotFound(w)

		return
	}

	w.Header().Set("Content-Type", asset.contentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content) // the client went away; nothing to report
}
