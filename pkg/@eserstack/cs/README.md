# ⚙️ [@eserstack/cs](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/cs` is published on
> npm under the same name (`pnpm add @eserstack/cs`); the JSR versions stay
> available but get no updates.

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/cs`

`@eserstack/cs` is a Kubernetes ConfigMap and Secret synchronization tool that
simplifies the management of configuration data and secrets in Kubernetes
environments. It works with both environment files and Kubernetes resources and
includes a CLI.

## 🚀 Getting Started with Kubernetes ConfigMaps and Secrets

ConfigMaps and Secrets are fundamental Kubernetes resources for managing
configuration data and sensitive information:

### ConfigMaps

ConfigMaps store configuration data in key-value pairs. They allow you to
decouple configuration artifacts from image content to keep containerized
applications portable.

### Secrets

Secrets are similar to ConfigMaps but are specifically intended to hold
confidential data such as passwords, OAuth tokens, and SSH keys.

### The Cloud Native Approach

Following cloud-native best practices, `@eserstack/cs` helps you manage
configurations using the **12-Factor App** methodology, particularly the
principle of storing configuration in environment variables.

## 🤔 What @eserstack/cs offers?

`@eserstack/cs` manages Kubernetes configuration resources:

- **Environment File Integration**: Load configuration from `.env` files and
  environment variables
- **Multiple Output Formats**: Generate YAML or JSON output for Kubernetes
  resources
- **CLI Interface**: Command-line tool for generating manifests and patches
- **Sync Capabilities**: Synchronize with existing Kubernetes resources using
  kubectl
- **Namespaces**: Put the resource in a namespace, or leave it in the namespace
  of the current kubectl context
- **Type Safety**: Built with TypeScript

`sync` reads values from these sources, and a later source overrides an earlier
one:

1. `.env`
2. `.env.<environment>`
3. `.env.local` (skipped when the environment is `test`)
4. `.env.<environment>.local`
5. Process environment variables

The environment name comes from `-e` (or the `env` option), then from the `ENV`,
`APP_ENV` or `NODE_ENV` variable, then defaults to `development`.
`generate` reads the `.env` files of the environment and no process environment
variables, whether it runs on the native ajan library or in TypeScript.

The data keys of a generated resource are sorted, and Secret values are the
base64 of their UTF-8 bytes. A YAML manifest is one document. The Go `eser cs`
in `cmd/eser` takes the same commands and flags.

## 🛠 Usage

Here you'll find examples of how to use `@eserstack/cs` for different scenarios.

### CLI Usage

The `eser` CLI runs these commands as `eser cs`. From a checkout of this
package, `node cli.ts` takes the same commands and flags.

**Generate a ConfigMap from the `.env` files of an environment:**

```bash
eser cs generate cm/my-config -e development
```

**Generate a Secret with specific namespace:**

```bash
eser cs generate secret/api-keys -n production -e production
```

**Save output to a file:**

```bash
eser cs generate cm/my-config -e development > configmap.yaml
```

**Sync with existing Kubernetes resource:**

```bash
eser cs sync configmap/my-existing-config -e production
```

`sync` prints a warning on stderr for each key of the resource that the
environment does not define, and leaves that key out of the patch.

**Generate patch string only (for saving to file):**

```bash
eser cs sync secret/api-keys -e production -s > patch.json
kubectl patch secret api-keys --type=merge --patch-file=patch.json
```

### Programmatic Usage

**Generate ConfigMap programmatically:**

```typescript
import * as cs from "@eserstack/cs";

const configMapYaml = await cs.generate({
  resource: { type: "configmap", name: "my-app-config" },
  namespace: "default",
  env: "development",
  format: "yaml",
});

console.log(configMapYaml);
```

**Sync with existing resource:**

`sync()` reads the keys of the resource with `kubectl get` and returns a
`kubectl patch` command that sets those keys from the environment.

```typescript
import * as cs from "@eserstack/cs";

const command = await cs.sync({
  resource: {
    type: "configmap",
    name: "existing-config",
    namespace: "production",
  },
  env: "production",
  format: "yaml",
  onMissingKey: (key) => console.warn(`${key} is not set; left out`),
});

console.log(command);
```

**Sync without kubectl:**

Pass `getResourceKeys` to read the keys some other way, for example from another
Kubernetes client or a fixed list in a test, and `cwd` to read the `.env` files
from another directory.

```typescript
import * as cs from "@eserstack/cs";

const patch = await cs.sync({
  resource: { type: "configmap", name: "app-config" },
  cwd: "./fixtures",
  stringOnly: true,
  getResourceKeys: () => Promise.resolve(["DATABASE_URL", "PORT"]),
});
```

### Environment File Example

Create a `.env` file:

```env
DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=your-secret-api-key
DEBUG=true
PORT=3000
```

This will generate appropriate ConfigMap or Secret resources with the specified
key-value pairs.

## 📕 API Reference

### CLI Commands

**generate**

- `<resource>`: Resource reference (e.g., `cm/name`, `configmap/name`,
  `secret/name`)
- `--namespace <ns>`: Kubernetes namespace
- `-e, --env <name>`: Environment name
- `-o, --output <format>`: Output format (yaml/json)

YAML output is one document, which `kubectl apply -f` reads as it is. JSON
output is a one-item array (`[{...}]`), the shape `serialize()` gives a list of
resources, and scripts read it as such; `kubectl apply` takes one object, so
pick it first: `... -o json | jq '.[0]' | kubectl apply -f -`.

**sync**

- `<resource>`: Resource reference (e.g., `configmap/name`, `secret/name`)
- `--namespace <ns>`: Kubernetes namespace
- `-e, --env <name>`: Environment name
- `-o, --output <format>`: Output format (yaml/json)

### Functions

**generate(options): Promise&lt;string&gt;** Generates Kubernetes ConfigMap or
Secret YAML/JSON from environment data.

**sync(options): Promise&lt;string&gt;** Synchronizes environment data with
existing Kubernetes resources using kubectl: returns the `kubectl patch`
command, or only the patch with `stringOnly`.

### Types

**SyncConfig** Configuration interface for defining ConfigMap/Secret properties,
labels, annotations, and output format.

**ConfigMap / Secret** Kubernetes resource type definitions following the
official API specifications.

**SyncOptions** Options for synchronizing with existing Kubernetes resources.
`onMissingKey(key)` is called for each key of the resource that the environment
does not define; the key is left out of the patch. `getResourceKeys(resource)`
replaces the `kubectl get` key lookup, and `cwd` sets the directory the `.env`
files are read from.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `sync()` no longer writes a console warning for a key the environment lacks,
  and no longer goes through the Go `EserAjanCsSync` path. Pass `onMissingKey`
  to be told:

  ```typescript
  import * as cs from "@eserstack/cs";

  const command = await cs.sync({
    resource: { type: "configmap", name: "app-config" },
    onMissingKey: (key) => console.warn(`${key} is not set; left out`), // After
  });
  ```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
