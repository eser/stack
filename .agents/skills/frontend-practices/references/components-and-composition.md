# Components and Composition

How React components are declared and how their APIs grow: props, exports,
module-level definitions, composition instead of configuration, and the React 19
ref and context APIs. File names are kebab-case like every other file
(`user-profile.tsx`); the `validate-filenames` check enforces it.

## Contents

- Single Props Object Pattern
- Named Exports for Components
- Define Components at Module Level
- Compose Variants Instead of Boolean Props
- Compound Components Share a Context Interface
- Lift Shared State Into the Provider
- Children Over Render Props
- React 19 Ref and Context APIs

---

## Single Props Object Pattern

Scope: React components

Rule: Take one `props` parameter and read `props.name`; do not destructure in
the signature.

Correct:

```tsx
type UserProfileProps = {
  userId: string;
  showActions: boolean;
};

export function UserProfile(props: UserProfileProps) {
  return (
    <div>
      <h1>User: {props.userId}</h1>
      {props.showActions ? <button type="button">Edit</button> : null}
    </div>
  );
}
```

Incorrect:

```tsx
export function UserProfile({ userId, showActions }: UserProfileProps) {
  return <h1>User: {userId}</h1>;
}
```

**Why:** `props.` marks which values come from the parent, and adding a prop
does not touch the signature.

---

## Named Exports for Components

Scope: React components

Rule: Components are named exports. Use a default export only in a file whose
framework contract requires one. laroux loads `proxy.ts` and `laroux.config.ts`
through `default`; pages, layouts and `route.ts` handlers are named exports
(laroux.md: Route Files and Exports).

Correct:

```tsx
// user-profile.tsx
export function UserProfile(props: UserProfileProps) {
  return <div>{props.name}</div>;
}
```

Incorrect:

```tsx
function UserProfile(props: UserProfileProps) {
  return <div>{props.name}</div>;
}
export default UserProfile;
```

---

## Define Components at Module Level

Scope: Every component

Rule: Declare components at module scope and pass what they need as props. A
component declared inside another one is a new type on every render, so React
unmounts and remounts it and loses its state, focus and DOM each time the parent
renders.

Correct:

```tsx
function Stats(props: { followers: number; posts: number }) {
  return (
    <p>
      {props.followers} followers, {props.posts} posts
    </p>
  );
}

export function UserProfile(props: UserProfileProps) {
  return <Stats followers={props.user.followers} posts={props.user.posts} />;
}
```

Incorrect:

```tsx
export function UserProfile(props: UserProfileProps) {
  const Stats = () => <p>{props.user.followers} followers</p>; // remounts every render
  return <Stats />;
}
```

**Why:** the symptoms (an input that loses focus on every keystroke, effects
that rerun, a scroll position that resets) look unrelated to the cause.

---

## Compose Variants Instead of Boolean Props

Scope: Components that grow modes (`isThread`, `isEditing`, `showAttachments`)

Rule: Do not add a boolean prop to switch a component's behavior. Build one
explicit variant per use case (`ThreadComposer`, `EditMessageComposer`) that
composes shared parts, each with its own provider.

Correct:

```tsx
export function EditMessageComposer(props: { messageId: string }) {
  return (
    <EditMessageProvider messageId={props.messageId}>
      <Composer.Frame>
        <Composer.Input />
        <Composer.Footer>
          <Composer.CancelEdit />
          <Composer.SaveEdit />
        </Composer.Footer>
      </Composer.Frame>
    </EditMessageProvider>
  );
}
```

Incorrect:

```tsx
<Composer isThread isEditing={false} channelId="abc" showAttachments />
```

**Why:** each boolean doubles the possible states and most combinations are
never tested; a variant states what it renders without the reader simulating the
conditionals.

---

## Compound Components Share a Context Interface

Scope: Components with several parts (a composer, a dialog, a data table)

Rule: Split the component into parts that read shared state from one context,
and export the parts as one object (`Composer.Frame`, `Composer.Input`). Type
the context value as `state`, `actions` and `meta`. Only the provider knows
where the state lives (local state, a global store, a server sync), so the same
parts work under any provider. Read the context through a hook that throws
outside the provider, so the parts do not each handle `null`.

```tsx
import * as React from "react";

type ComposerState = { input: string; isSubmitting: boolean };

type ComposerContextValue = {
  state: ComposerState;
  actions: {
    update: (updater: (state: ComposerState) => ComposerState) => void;
    submit: () => void;
  };
  meta: { inputRef: React.RefObject<HTMLTextAreaElement | null> };
};

const ComposerContext = React.createContext<ComposerContextValue | null>(null);

function useComposer(): ComposerContextValue {
  const value = React.use(ComposerContext);
  if (value === null) {
    throw new Error("Composer parts must render inside a composer provider");
  }
  return value;
}

function ComposerProvider(props: {
  value: ComposerContextValue;
  children: React.ReactNode;
}) {
  return (
    <ComposerContext value={props.value}>{props.children}</ComposerContext>
  );
}

function ComposerInput() {
  const composer = useComposer();
  return (
    <textarea
      ref={composer.meta.inputRef}
      value={composer.state.input}
      onChange={(event) =>
        composer.actions.update((s) => ({ ...s, input: event.target.value }))
      }
    />
  );
}

export const Composer = {
  Provider: ComposerProvider,
  Frame: ComposerFrame,
  Input: ComposerInput,
  Submit: ComposerSubmit,
};
```

A provider for local state and one for a synced channel both fill the same
`ComposerContextValue`; `Composer.Input` never changes.

**Why:** consumers compose exactly the parts they need, and swapping the
provider swaps the state source without touching the UI.

---

## Lift Shared State Into the Provider

Scope: State that components outside the visual box need

Rule: When a sibling outside the component needs its state or actions (a
preview, a dialog's submit button), move the state into a provider that wraps
both. Do not mirror state upward with an effect and do not read it through a ref
on submit.

Correct:

```tsx
export function ForwardMessageDialog() {
  return (
    <ForwardMessageProvider>
      <Dialog>
        <ForwardMessageComposer />
        <MessagePreview />
        <ForwardButton />
      </Dialog>
    </ForwardMessageProvider>
  );
}
```

Incorrect:

```tsx
React.useEffect(() => {
  props.onInputChange(state.input); // mirrors state upward on every change
}, [state.input]);
```

**Why:** the provider boundary decides access, not visual nesting; a mirrored
copy renders twice and drifts from its source.

---

## Children Over Render Props

Scope: Component APIs that accept content

Rule: Accept `children` for structure. Use a render prop only when the parent
hands data to the child, as a list hands each item to `renderItem`.

Correct:

```tsx
<Composer.Footer>
  <Composer.Formatting />
  <SubmitButton />
</Composer.Footer>;

<List items={props.items} renderItem={(item) => <ItemRow item={item} />} />;
```

Incorrect:

```tsx
<Composer
  renderHeader={() => <CustomHeader />}
  renderActions={() => <SubmitButton />}
/>
```

**Why:** children read as the markup they produce; a render prop makes the
reader learn a callback signature to place static content.

---

## React 19 Ref and Context APIs

Scope: React 19 components

Rule: `ref` is a regular prop: declare it in the props type and pass it on; do
not wrap components in `forwardRef`. Read context with `React.use(Context)`,
which may also run inside a condition, and render `<Context value={…}>` as the
provider instead of `<Context.Provider>`.

Correct:

```tsx
type TextFieldProps = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  ref?: React.Ref<HTMLInputElement>;
};

export function TextField(props: TextFieldProps) {
  return (
    <input ref={props.ref} value={props.value} onChange={props.onChange} />
  );
}
```

Incorrect:

```tsx
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  (props, ref) => <input ref={ref} {...props} />,
);
```

**Why:** React plans to deprecate `forwardRef` and `Context.Provider`; new code
written with them carries wrappers React 19 no longer needs.
