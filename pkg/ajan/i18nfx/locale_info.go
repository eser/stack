package i18nfx

import "golang.org/x/text/language"

// IsRTL reports whether locale is written in a right-to-left script. It reads
// the script from the BCP 47 tag, so "ar-EG", "he", "fa" and "az-Arab" are
// right-to-left while "az" (Latin) is not. A tag that does not parse is
// reported as left-to-right.
func IsRTL(locale string) bool {
	tag, err := language.Parse(locale)
	if err != nil {
		return false
	}

	script, confidence := tag.Script()
	if confidence == language.No {
		return false
	}

	// The right-to-left scripts of the languages CLDR lays out right-to-left.
	switch script.String() {
	case "Adlm", "Arab", "Hebr", "Nkoo", "Rohg", "Syrc", "Thaa":
		return true
	default:
		return false
	}
}

// Dir returns "rtl" or "ltr" for the given locale, for an HTML dir attribute.
func Dir(locale string) string {
	if IsRTL(locale) {
		return "rtl"
	}

	return "ltr"
}
