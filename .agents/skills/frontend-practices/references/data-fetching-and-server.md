# Data Fetching and Server Code

How data reaches components without waterfalls: async ordering, server
components, streaming, request deduplication, caches and server actions. The
laroux specifics are in laroux.md.

## Contents

- Start Independent Work Before Awaiting
- Await Only Where the Value Is Used
- Fetch in Parallel Through Composition
- Stream Slow Data Behind Suspense
- Pass Only What the Client Uses
- Deduplicate Per Request
- Bound Cross-Request Caches
- No Request State in Module Scope
- Load Static Server Assets Once, Lazily
- Server Actions Are Public Endpoints
- Deduplicate Client Requests

---

## Start Independent Work Before Awaiting

Scope: Async functions, handlers and server components that make several calls

Rule: Start every promise whose inputs are ready, then await them together with
`Promise.all`. When one call needs another's result, chain it on that promise
instead of awaiting everything first.

Correct:

```ts
const userPromise = fetchUser(userId);
const profilePromise = userPromise.then((user) => fetchProfile(user.profileId));
const [user, config, profile] = await Promise.all([
  userPromise,
  fetchConfig(),
  profilePromise,
]);
```

Incorrect:

```ts
const user = await fetchUser(userId);
const config = await fetchConfig(); // waits for fetchUser for no reason
const profile = await fetchProfile(user.profileId);
```

**Why:** each sequential `await` of independent work adds a full round trip to
the response time.

---

## Await Only Where the Value Is Used

Scope: Functions with early returns or conditional work

Rule: Move an `await` into the branch that needs it, and test cheap synchronous
conditions before awaiting a remote one (a feature flag, a permission lookup).

Correct:

```ts
export async function handleRequest(userId: string, skip: boolean) {
  if (skip) {
    return { skipped: true };
  }
  const userData = await fetchUserData(userId);
  return processUserData(userData);
}

if (props.query.length > 0 && (await isFeatureEnabled("search"))) {
  // ...
}
```

Incorrect:

```ts
const userData = await fetchUserData(userId); // fetched even when skipping
if (skip) {
  return { skipped: true };
}
```

---

## Fetch in Parallel Through Composition

Scope: Async server components

Rule: Each server component awaits only its own data, so siblings fetch in
parallel. A parent that awaits before returning its children makes them wait.
For a list whose items need a second fetch, chain each item's second fetch
inside one `Promise.all` instead of finishing the first stage for every item.

Correct:

```tsx
async function Header() {
  const header = await fetchHeader();
  return <h1>{header.title}</h1>;
}

export function DashboardPage() {
  return (
    <main>
      <Header />
      <Sidebar />
    </main>
  );
}

const chats = await Promise.all(
  chatIds.map(async (id) => {
    const chat = await getChat(id);
    return { chat, author: await getUser(chat.authorId) };
  }),
);
```

Incorrect:

```tsx
export async function DashboardPage() {
  const header = await fetchHeader(); // Sidebar starts only after this
  return (
    <main>
      <h1>{header.title}</h1>
      <Sidebar />
    </main>
  );
}
```

---

## Stream Slow Data Behind Suspense

Scope: Pages with parts that wait on slow data

Rule: Wrap the part that waits in `<React.Suspense fallback={…}>` so the rest of
the page renders and streams first. When several components need the same
request, start it once in their common parent and pass the promise down for
async server components to `await`. Under React's own RSC renderer a client
component can receive the promise and read it with `React.use`; laroux cannot
send a promise to the client (laroux.md: Props Crossing the Boundary). Keep data
outside Suspense when it decides the page layout, carries above-the-fold content
that search engines must see, returns faster than a fallback would show, or
would shift the layout when it arrives.

Correct:

```tsx
export function ProjectPage(props: { projectId: string }) {
  const activityPromise = fetchActivity(props.projectId);
  return (
    <main>
      <ProjectHeader projectId={props.projectId} />
      <React.Suspense fallback={<ActivitySkeleton />}>
        <ActivityFeed activity={activityPromise} />
      </React.Suspense>
    </main>
  );
}
```

**Why:** without a boundary the slowest query sets the time to first byte for
the whole page.

---

## Pass Only What the Client Uses

Scope: Props from server components to client components

Rule: Everything passed to a client component is serialized into the page. Pass
the fields it renders, not whole records, and pass each piece of data once: send
a list and let the client derive its sorted or filtered copy instead of sending
both. The values must survive serialization; laroux's limits are in laroux.md:
Props Crossing the Boundary.

Correct:

```tsx
<ProfileCard name={user.name} avatarUrl={user.avatarUrl} />
```

Incorrect:

```tsx
<ProfileCard user={user} /> // ships every column, including ones the page must not expose
```

**Why:** the payload grows with every field, and a field in props is readable in
the page source even when nothing renders it.

---

## Deduplicate Per Request

Scope: Lookups that several components repeat during one request

Rule: Fetch the data once per request. Under a renderer that implements React's
request cache, wrap the loader in `React.cache` and call it with primitive
arguments: it compares arguments by identity, so an inline object misses every
time. laroux's renderer does not implement it (laroux.md: Per-Request Data Under
laroux); fetch in the closest common parent and pass the result or its promise
down.

Correct:

```ts
export const getCurrentUser = React.cache(async (sessionId: string) => {
  return await users.findBySession(sessionId);
});
```

Incorrect:

```ts
await getProject({ id: projectId }); // a new object each call: never a cache hit
```

---

## Bound Cross-Request Caches

Scope: Caches that outlive a request (module-level maps of computed results)

Rule: A cache shared across requests has a maximum size and a time to live, and
holds only values that are the same for every user, or keys that include the
user. A bare `Map` that only grows is a memory leak (coding-practices: Bound
Every Resource). Adding a cache library goes through tooling-standards: Adding a
Dependency.

---

## No Request State in Module Scope

Scope: Server components, server actions and SSR code

Rule: Module scope is shared by every concurrent request in the process. Never
write request data (the current user, cookies, the locale) into a module-level
variable during a render. Pass it through props or a request-scoped context.

Incorrect:

```tsx
let currentUser: User | null = null;

export async function ProfilePage(props: { sessionId: string }) {
  currentUser = await getUser(props.sessionId); // another request may read it
  return <Profile />;
}
```

**Why:** two requests that interleave at an `await` read each other's data, and
the leak appears only under load.

---

## Load Static Server Assets Once, Lazily

Scope: Files every request reads (fonts and logos for generated images,
templates)

Rule: Read such a file once per process through a getter that caches the promise
on first call, never at import time (design-principles: Module-Level Side
Effects). Files that depend on the request or the user are read per request.

Correct:

```ts
let fontPromise: Promise<Uint8Array> | null = null;

function getFont(): Promise<Uint8Array> {
  if (fontPromise === null) {
    fontPromise = runtime.fs.readFile(FONT_PATH);
  }
  return fontPromise;
}
```

---

## Server Actions Are Public Endpoints

Scope: Every server action and `route.ts` handler

Rule: A server action is an HTTP endpoint that anyone can call with any
arguments, whether or not a page renders a form for it. Inside every action,
authenticate the caller, authorize against the target resource
(security-practices: Authorization in the Handler) and validate each argument
with a schema (security-practices: Input Validation). Middleware, a hidden
button or a check in the calling component is not the check.

Correct:

```ts
"use server";

export async function deleteProject(input: unknown) {
  const session = await requireSession();
  const projectId = parseProjectId(input);
  const project = await projects.get(projectId);
  if (project === null || project.ownerId !== session.userId) {
    throw new ForbiddenError("cannot delete this project");
  }
  await projects.remove(projectId);
}
```

Incorrect:

```ts
"use server";

export async function deleteProject(projectId: string) {
  await projects.remove(projectId); // the page only shows the button to owners
}
```

---

## Deduplicate Client Requests

Scope: Data fetched from client components

Rule: Data the first render needs comes from server components. Data a client
component loads later goes through one shared fetch layer that deduplicates
in-flight requests for the same key and caches the result for the component
tree, not through a separate `fetch` in each component's effect. A data-fetching
library is a dependency like any other (tooling-standards: Adding a Dependency).

**Why:** three components that mount together otherwise send three identical
requests and can render three different answers.
