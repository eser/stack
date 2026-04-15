package i18nfx

// IsRTL returns true if the given locale code uses right-to-left script.
func IsRTL(locale string) bool {
	return locale == "ar"
}

// Dir returns "rtl" or "ltr" for the given locale.
func Dir(locale string) string {
	if IsRTL(locale) {
		return "rtl"
	}

	return "ltr"
}
