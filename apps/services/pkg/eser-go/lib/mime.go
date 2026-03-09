package lib

import "mime"

func EnsureMimetypesRegistered() {
	_ = mime.AddExtensionType(".mp3", "audio/mpeg")
	_ = mime.AddExtensionType(".wav", "audio/wav")
	_ = mime.AddExtensionType(".ogg", "audio/ogg")
	_ = mime.AddExtensionType(".mp4", "audio/mp4")
	_ = mime.AddExtensionType(".m4a", "audio/mp4")
}
