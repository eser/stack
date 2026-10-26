# 📣 [@eserstack/posts](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/posts` is published
> on npm under the same name (`pnpm add @eserstack/posts`); the JSR versions
> stay available but get no updates.

> **eserstack Tool** · [eser/stack on GitHub](https://github.com/eser/stack) ·
> **Install:** `pnpm add jsr:@eserstack/posts`

`@eserstack/posts` publishes, reads and manages posts on Twitter/X and Bluesky.
It powers the `eser posts` commands and an interactive terminal menu, and it
exposes the platform rules (character limits, handles, threads) and the
application layer (`PostService`, handlers and their ports) for programs that
wire their own adapters. The package follows a hexagonal layout: the domain and
the application layer have no platform code, and the Twitter/X, Bluesky,
Anthropic and token-file adapters are wired at a composition root.

## Quick Start

Create a Bluesky app password in the Bluesky settings and put it, with your
handle, in `.env.local` in the directory you run `eser posts` from:

```dotenv
BLUESKY_IDENTIFIER=your_handle.bsky.social
BLUESKY_APP_PASSWORD=your_app_password
```

Then log in, post and read your timeline:

```bash
eser posts login --platform=bluesky
eser posts compose "Hello from eserstack" --platform=bluesky
eser posts timeline --unified
```

In code, check a post against a platform's character limit before you send it:

```typescript
import * as posts from "@eserstack/posts";

const check = posts.validatePostLength("Hello from eserstack", {
  platform: "bluesky",
  subscriptionTier: "free",
});
// { valid: true, length: 20, limit: 300, remaining: 280 }
```

## Command Line

The [`eser` CLI](../cli/README.md) registers this package as `eser posts`.
Platform names are `twitter` and `bluesky`. A command that works on one platform
uses the platform you name with `--platform`; where the flag is optional and you
leave it out, the command uses the first configured platform: `twitter` when
`TWITTER_CLIENT_ID` is set, `bluesky` otherwise. Each command loads the saved
tokens of the platform it uses and refreshes them when they expire. `search`
without `--platform` and `timeline --unified` read from every platform you are
logged in to, 10 posts from each unless you set `--max`.

| Command                                                                | What it does                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| `eser posts compose <text> [--platform=<platform>]`                    | Publish a post                                      |
| `eser posts reply --to=<post-id> <text> [--platform=<platform>]`       | Reply to a post                                     |
| `eser posts thread <text1> <text2> ... [--platform=<platform>]`        | Publish a thread; each argument is one post         |
| `eser posts quote <post-id> --text=<commentary> --platform=<platform>` | Quote a post with your own commentary               |
| `eser posts repost <post-id> --platform=<platform>`                    | Repost a post without commentary                    |
| `eser posts unrepost <post-id> --platform=<platform>`                  | Remove a repost                                     |
| `eser posts timeline [--platform=<platform>] [--max=<n>]`              | Show your timeline on one platform                  |
| `eser posts timeline --unified [--max=<n>]`                            | Show all platforms merged, newest first             |
| `eser posts search <query> [--platform=<platform>] [--max=<n>]`        | Search posts by keyword or hashtag                  |
| `eser posts bookmark <post-id> --platform=<platform>`                  | Add a post to your bookmarks                        |
| `eser posts bookmarks --platform=<platform> [--max=<n>]`               | List your bookmarks                                 |
| `eser posts unbookmark <post-id> --platform=<platform>`                | Remove a post from your bookmarks                   |
| `eser posts login [--platform=<platform>] [--handle=<handle>]`         | Log in and save the tokens for later commands       |
| `eser posts logout [--platform=<platform>]`                            | Clear the saved tokens of one or every platform     |
| `eser posts status`                                                    | Show the configured platforms and their login state |
| `eser posts usage [--platform=<platform>]`                             | Show API usage (daily call counts and the total)    |

`eser posts login` saves the tokens in the token file, and every later command
and the terminal menu use them. Without `--platform` it logs in to each
configured platform in turn and stops at the first one that fails.

- Twitter/X uses OAuth 2.0 with PKCE in the browser. The command prints the
  authorization URL and waits up to two minutes for the redirect on the loopback
  address in `TWITTER_REDIRECT_URI`. If the redirect does not arrive, paste the
  full redirect URL at the prompt. Either way the command accepts the redirect
  only when its `state` matches the login attempt, then exchanges the code and
  saves the tokens.
- Bluesky logs in with the app password in `BLUESKY_APP_PASSWORD`, for the
  account in `--handle` or `BLUESKY_IDENTIFIER`. Use an app password from the
  Bluesky settings, not your main password. There is no `--password` flag: a
  password on the command line stays in your shell history and shows in the
  process list.

`eser posts status` loads the saved tokens and shows, for each configured
platform, whether it is logged in or why its saved tokens cannot be read.

## Terminal Menu

The terminal menu offers the same operations as interactive prompts, adds
translate and post, and restores saved sessions when it starts. Run it from the
root of an eser/stack checkout:

```bash
node pkg/@eserstack/posts/adapters/tui/app.ts
```

The package's `tui` script runs the same command from `pkg/@eserstack/posts`:
`node --run tui`.

For a Twitter/X login, the menu prints the authorization URL and waits up to two
minutes for the redirect on the loopback address in `TWITTER_REDIRECT_URI`. If
the redirect does not arrive, paste the full redirect URL at the prompt; the
menu accepts it only when its `state` matches the login attempt. This is the
same flow as `eser posts login --platform=twitter`, and a login in either one is
saved for the other.

## Configuration

The package reads its settings with `loadPostsConfig()`, in this order, later
sources winning: `.env`, `.env.<environment>`, `.env.local`,
`.env.<environment>.local`, then the process environment. Keep secrets in
`.env.local` and out of version control.

| Variable                 | Purpose                                                                  | Required                  | Default                          | Example                          |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------- | -------------------------------- | -------------------------------- |
| `TWITTER_CLIENT_ID`      | OAuth 2.0 client ID from the X developer portal; enables Twitter/X       | For Twitter/X             | none                             | `your_twitter_client_id`         |
| `TWITTER_CLIENT_SECRET`  | Client secret of a confidential X client (a Web App or an Automated App) | For a confidential client | none                             | `your_twitter_client_secret`     |
| `TWITTER_REDIRECT_URI`   | OAuth redirect URI; must use a loopback host                             | No                        | `http://127.0.0.1:8080/callback` | `http://127.0.0.1:9000/callback` |
| `TWITTER_API_BASE_URL`   | X API base URL, for a mock server in tests                               | No                        | `https://api.twitter.com/2`      | `http://127.0.0.1:4010`          |
| `BLUESKY_PDS_HOST`       | Bluesky PDS host                                                         | No                        | `https://bsky.social`            | `https://your_pds_host`          |
| `BLUESKY_IDENTIFIER`     | Handle or DID that `eser posts login` uses; `--handle` overrides it      | For a Bluesky login       | none                             | `your_handle.bsky.social`        |
| `BLUESKY_APP_PASSWORD`   | App password that `eser posts login` logs in with                        | For a Bluesky login       | none                             | `your_app_password`              |
| `ANTHROPIC_API_KEY`      | Enables translate and post; without it translation fails                 | For translation           | none                             | `your_anthropic_api_key`         |
| `POSTS_TOKEN_STORE_PATH` | Token file; an absolute path or one that starts with `~/`                | No                        | `~/.eser/posts/tokens.json`      | `~/.config/posts/tokens.json`    |

`TWITTER_API_BASE_URL`, `BLUESKY_PDS_HOST` and `POSTS_TOKEN_STORE_PATH` decide
where credentials are sent or stored, so they come from the process environment
only, never from a `.env` file in the working directory. The two URLs must use
`https://`; plain `http://` is accepted only for a loopback host.

Keep `TWITTER_CLIENT_SECRET`, `BLUESKY_APP_PASSWORD` and `ANTHROPIC_API_KEY` in
`.env.local` or in the environment. An empty value, such as the line
`BLUESKY_IDENTIFIER=` in the package's `.env` template, counts as unset.

The token file holds access and refresh tokens. On POSIX systems the package
creates it with mode `0600` in a `0700` directory and repairs looser modes on
every write.

## Library API

The package root exports the domain and application layers. The adapters stay
internal; implement the ports below to connect another platform or store.

### Platform Rules

The domain owns the per-platform rules, so every adapter enforces the same
limits:

- `getCharacterLimit(context)`: the limit for a platform and subscription tier
  (Twitter/X 280, or 25,000 for Premium+ and Business; Bluesky 300)
- `getMinCharacterLimit(contexts)`: the strictest limit across platforms, for a
  cross-post
- `validatePostLength(text, context)`: `valid`, `length`, `limit` and
  `remaining` (negative when over the limit)
- `createThread(texts)`: a thread of at least two non-empty posts; throws
  otherwise
- `toHandle(value)`: a handle without the leading `@`, in lowercase
- `toPostId(value)`: a branded post id (a Twitter/X numeric id or a Bluesky
  AT-URI), without any normalization

```typescript
import * as posts from "@eserstack/posts";

const limit = posts.getMinCharacterLimit([
  { platform: "twitter", subscriptionTier: "free" },
  { platform: "bluesky", subscriptionTier: "free" },
]); // 280

const thread = posts.createThread(["First post", "Second post"]);
const handle = posts.toHandle("@EserOzvataf"); // "eserozvataf"
```

### Configuration Loading

`loadPostsConfig()` returns a typed `PostsConfig`. `validateConfig()` returns a
`Result` that fails with the missing variable names when no platform has
credentials:

```typescript
import * as posts from "@eserstack/posts";
import * as primitives from "@eserstack/primitives";

const config = await posts.loadPostsConfig();
const validated = posts.validateConfig(config);

if (primitives.results.isFail(validated)) {
  throw new Error(validated.error.message);
}
```

### Application Layer

`PostService` routes each operation to the `SocialApi` of the chosen platform
and returns a `Result` instead of throwing. Its constructor takes the platform
connections, a `Translator`, a `Scheduler` and a `FeedAggregator`
(`DefaultFeedAggregator` merges timelines newest first and skips a platform that
fails).

The `handlers` namespace holds one handler per use case. Each returns a `Task`
that needs a `PostsCtx`; `createBoundTriggers(ctx)` binds the context once and
returns context-free triggers. The handler input types, such as `ComposeInput`,
are also exported from the package root, as are the `Result` and `Task` types
the API returns. A handler wraps the API call in `withFreshTokens` for the
platform the input names or, when an optional platform is left out, for the
first platform in `ctx.auths`. `withFreshTokens` loads that platform's tokens,
refreshes them when they expire within 60 seconds, and saves them back even when
the call fails:

```typescript
import * as posts from "@eserstack/posts";
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

export async function publish(ctx: posts.PostsCtx, text: string) {
  const triggers = posts.createBoundTriggers(ctx);
  const result = await functions.task.runTask(
    triggers.composeTweet({ text, platform: "bluesky" }),
  );

  if (primitives.results.isFail(result)) {
    throw result.error;
  }

  return result.value; // the published Post
}
```

The ports you implement:

| Port             | Responsibility                                                      |
| ---------------- | ------------------------------------------------------------------- |
| `SocialApi`      | Posting, reading, reposts, bookmarks and usage against one platform |
| `AuthProvider`   | Browser OAuth or credential login, token refresh and installation   |
| `TokenStore`     | Loads, saves and clears tokens per platform                         |
| `Translator`     | Translates text between BCP 47 language codes                       |
| `Scheduler`      | Stores posts to send later                                          |
| `FeedAggregator` | Merges timelines across platforms                                   |

Operations that touch several posts or platforms fail with errors that keep the
partial outcome:

- `ThreadPartialError`: the posts that went out before a thread stopped, and the
  index that failed
- `FanOutPartialError`: per-platform successes and failures of a cross-post

`handlers.composePostToAllHandler` publishes on one platform after another and
fails with `FanOutPartialError` when any platform fails, whether or not the
context has auth providers. With them it visits the platforms in `ctx.auths`
order; without them it calls `PostService.composePostToAll`, which visits the
platform connections in the order its constructor received them. The
cross-platform reads, `handlers.searchPostsAllHandler` and
`handlers.getUnifiedTimelineHandler`, ask each platform for 10 posts when the
input sets no limit, and leave out a platform that fails.

`withFreshTokens` fails with `AuthRequiredError` when a platform has no saved
tokens, or when its token expired and there is no refresh token.

`restoreSavedTokens(tokenStore, auths)` installs each platform's saved tokens
into its auth provider and reports the platforms whose tokens could not be read.
The terminal menu and `eser posts status` call it to show who is logged in; API
calls do not need it, since `withFreshTokens` loads the tokens itself.

The `@eserstack/posts/go-posts` export offers a smaller posting and reading
service backed by the Go implementation in `@eserstack/ajan`.

The `@eserstack/posts/testing` export holds in-memory mocks of every port, such
as `createMockSocialApi` and `createMockTokenStore`, and test data factories.
Each mock records its calls and takes per-method overrides, so a test can make
one platform fail and check what your code did next.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `eser posts login --password=...` (and a bare `--password`) fails with exit
  code 1, and `login` rejects unknown flags and positional arguments. Put the
  Bluesky credentials in the environment or in `.env.local`:

  ```bash
  # Before
  eser posts login --platform=bluesky --handle=you.bsky.social --password=your_app_password
  # After
  export BLUESKY_IDENTIFIER=you.bsky.social BLUESKY_APP_PASSWORD=your_app_password
  eser posts login --platform=bluesky
  ```

- `eser posts login --platform=twitter` waits up to two minutes for the loopback
  redirect (or a pasted redirect URL) and saves the tokens, instead of printing
  a URL and a `login-callback` hint. Complete the browser authorization while
  the command waits.
- `loadPostsConfig()` returns `undefined` instead of `""` for an empty
  `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `BLUESKY_IDENTIFIER`,
  `BLUESKY_APP_PASSWORD` or `ANTHROPIC_API_KEY`. Before:
  `config.twitter.clientId === ""`. After:
  `config.twitter.clientId === undefined`.
- Setting `TWITTER_CLIENT_SECRET` makes X token requests send HTTP Basic client
  authentication. Set it only for a confidential X client; leave it unset for a
  public Native App client.
- `handlers.composePostToAllHandler` without auth providers fails with
  `FanOutPartialError` when any platform fails, and fails when no platform is
  configured; it returned the successes, or `ok([])`. Handle
  `FanOutPartialError` (`posted`, `failed`, `totalPlatforms`) on this path too.
- `FanOutPartialError` and `ThreadPartialError` messages changed. Match on
  `error.code` (`FANOUT_PARTIAL`, `THREAD_PARTIAL`) or `instanceof`, not on the
  text. When a thread stops partway, `eser posts thread` prints one error line
  with that message, then the published posts, instead of
  `Thread partially posted: k/n succeeded` and `Failed at index i: <cause>`.
- `eser posts reply` without `--platform` replies on the first configured
  platform instead of always on X. Pass `--platform=twitter` to keep X.

## 🔗 Links

- [eser/stack on GitHub](https://github.com/eser/stack)
- [`@eserstack/cli`](../cli/README.md): the `eser` command that registers
  `eser posts`
- [`@eserstack/functions`](../functions/README.md): `Task`, handlers and
  `bracket`, which the application layer builds on
- [`@eserstack/primitives`](../primitives/README.md): the `Result` type every
  operation returns
- [Bluesky app passwords](https://bsky.app/settings/app-passwords)
- [X developer documentation](https://docs.x.com)
