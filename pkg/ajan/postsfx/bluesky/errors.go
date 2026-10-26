// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package bluesky

import "errors"

// Sentinel errors for the bluesky adapter.
var (
	ErrDIDRequired          = errors.New("DID not set — call SetTokens or LoginWithCredentials first")
	ErrRkeyExtractFailed    = errors.New("cannot extract rkey from AT URI")
	ErrPostNotFound         = errors.New("post not found")
	ErrReplyTargetRequired  = errors.New("InReplyToPost is required")
	ErrEmptyTexts           = errors.New("texts must not be empty")
	ErrRepostNotFound       = errors.New("repost record not found")
	ErrBookmarksUnsupported = errors.New("bluesky does not support bookmarks via API")
	ErrBrowserNotRequired   = errors.New("bluesky uses credential login; call LoginWithCredentials instead")
)
