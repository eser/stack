// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package twitter

import "errors"

// Sentinel errors for the twitter adapter.
var (
	ErrEmptyResponse       = errors.New("empty API response")
	ErrNotFound            = errors.New("tweet not found")
	ErrReplyTargetRequired = errors.New("InReplyToPost is required")
	ErrEmptyTexts          = errors.New("texts must not be empty")
	ErrBrowserRequired     = errors.New("twitter requires OAuth 2.0 browser flow")
)
