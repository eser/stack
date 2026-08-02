// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package bluesky provides an AT Protocol (Bluesky) adapter for postsfx.
package bluesky

// Wire types for the AT Protocol / XRPC API.

type apiSession struct {
	AccessJwt  string `json:"accessJwt"`
	RefreshJwt string `json:"refreshJwt"`
	DID        string `json:"did"`
	Handle     string `json:"handle"`
}

type apiProfile struct {
	DID         string `json:"did"`
	Handle      string `json:"handle"`
	DisplayName string `json:"displayName"`
}

// apiRef is a {uri, cid} pair used in reply/embed references.
type apiRef struct {
	URI string `json:"uri"`
	CID string `json:"cid"`
}

type apiReplyRef struct {
	Root   apiRef `json:"root"`
	Parent apiRef `json:"parent"`
}

type apiEmbedRecord struct {
	Type   string `json:"$type"`
	Record apiRef `json:"record"`
}

// apiPostRecord is the body of a com.atproto.repo.createRecord call for posts.
type apiPostRecord struct {
	Type      string       `json:"$type"`
	Text      string       `json:"text"`
	CreatedAt string       `json:"createdAt"`
	Reply     *apiReplyRef `json:"reply,omitempty"`
	Embed     any          `json:"embed,omitempty"`
}

// apiRepostRecord is the body of a com.atproto.repo.createRecord call for reposts.
type apiRepostRecord struct {
	Type      string `json:"$type"`
	Subject   apiRef `json:"subject"`
	CreatedAt string `json:"createdAt"`
}

type apiCreateRecordRequest struct {
	Repo       string `json:"repo"`
	Collection string `json:"collection"`
	Record     any    `json:"record"`
}

type apiCreateRecordResponse struct {
	URI string `json:"uri"`
	CID string `json:"cid"`
}

type apiDeleteRecordRequest struct {
	Repo       string `json:"repo"`
	Collection string `json:"collection"`
	RKey       string `json:"rkey"`
}

type apiFeedPost struct {
	Post  apiPostView   `json:"post"`
	Reply *apiReplyMeta `json:"reply,omitempty"`
}

type apiPostView struct {
	URI       string            `json:"uri"`
	CID       string            `json:"cid"`
	Author    apiProfile        `json:"author"`
	Record    apiPostViewRecord `json:"record"`
	IndexedAt string            `json:"indexedAt"`
}

type apiPostViewRecord struct {
	Type      string `json:"$type"`
	Text      string `json:"text"`
	CreatedAt string `json:"createdAt"`
}

type apiReplyMeta struct {
	Root   apiPostView `json:"root"`
	Parent apiPostView `json:"parent"`
}

type apiGetTimelineResponse struct {
	Feed   []apiFeedPost `json:"feed"`
	Cursor string        `json:"cursor,omitempty"`
}

type apiGetPostsResponse struct {
	Posts []apiPostView `json:"posts"`
}

type apiSearchPostsResponse struct {
	Posts  []apiPostView `json:"posts"`
	Cursor string        `json:"cursor,omitempty"`
}

type apiListRecordsResponse struct {
	Records []apiListRecord `json:"records"`
	Cursor  string          `json:"cursor,omitempty"`
}

type apiListRecord struct {
	URI   string             `json:"uri"`
	CID   string             `json:"cid"`
	Value apiRepostRecordVal `json:"value"`
}

type apiRepostRecordVal struct {
	Subject apiRef `json:"subject"`
}

type apiThreadResponse struct {
	Thread apiThreadView `json:"thread"`
}

type apiThreadView struct {
	Post    apiPostView     `json:"post"`
	Replies []apiThreadView `json:"replies,omitempty"`
}

// AT Protocol lexicon names.
const (
	lexiconPost        = "app.bsky.feed.post"
	lexiconRepost      = "app.bsky.feed.repost"
	lexiconEmbedRecord = "app.bsky.embed.record"
)
