# ⚙️ [@eser/cs](./)

`@eser/cs` is a Kubernetes ConfigMap and Secret synchronization tool that
simplifies the management of configuration data and secrets in Kubernetes
environments. It provides seamless integration between environment files and
Kubernetes resources with built-in CLI capabilities.

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

Following cloud-native best practices, `@eser/cs` helps you manage
configurations using the **12-Factor App** methodology, particularly the
principle of storing configuration in environment variables.

## 🤔 What @eser/cs offers?

`@eser/cs` provides a comprehensive solution for managing Kubernetes
configuration resources:

- **Environment File Integration**: Load configuration from `.env` files and
  environment variables
- **Multiple Output Formats**: Generate YAML or JSON output for Kubernetes
  resources
- **CLI Interface**: Easy-to-use command-line tool for common operations
- **Sync Capabilities**: Synchronize with existing Kubernetes resources using
  kubectl
- **Flexible Configuration**: Support for custom labels, annotations, and
  namespaces
- **Type Safety**: Built with TypeScript for enhanced developer experience

The tool supports various configuration sources in order of precedence:

- Command-line arguments
- Configuration files (k8s.yaml, k8s.json)
- Environment variables
- .env files

## 🛠 Usage

Here you'll find examples of how to use `@eser/cs` for different scenarios.

### CLI Usage

**Generate a ConfigMap from an environment file:**

```bash
deno run -A jsr:@eser/cs/cli generate cm/my-config -f .env
```

**Generate a Secret with specific namespace:**

```bash
deno run -A jsr:@eser/cs/cli generate secret/api-keys -n production -f .env.prod
```

**Save output to a file:**

```bash
deno run -A jsr:@eser/cs/cli generate cm/my-config -f .env > configmap.yaml
```

**Sync with existing Kubernetes resource:**

```bash
deno run -A jsr:@eser/cs/cli sync configmap/my-existing-config -f .env.prod
```

**Generate patch string only (for saving to file):**

```bash
deno run -A jsr:@eser/cs/cli sync secret/api-keys -f .env.prod -s > patch.json
kubectl patch secret api-keys --type=merge --patch-file=patch.json
```

### Programmatic Usage

**Generate ConfigMap programmatically:**

```js
import { generate } from "@eser/cs";

const configMapYaml = await generate({
  resource: { type: "configmap", name: "my-app-config" },
  namespace: "default",
  envFile: ".env",
  format: "yaml",
});

console.log(configMapYaml);
```

**Sync with existing resource:**

```js
import { sync } from "@eser/cs";

await sync({
  resource: {
    type: "configmap",
    name: "existing-config",
    namespace: "production",
  },
  envFile: ".env.prod",
  format: "yaml",
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
- `--reference-env-file <path>`: Path to environment file
- `-o, --output <format>`: Output format (yaml/json)

**sync**

- `<resource>`: Resource reference (e.g., `configmap/name`, `secret/name`)
- `--namespace <ns>`: Kubernetes namespace
- `--reference-env-file <path>`: Path to environment file
- `-o, --output <format>`: Output format (yaml/json)

### Functions

**generate(options): Promise&lt;string&gt;** Generates Kubernetes ConfigMap or
Secret YAML/JSON from environment data.

**sync(options): Promise&lt;void&gt;** Synchronizes environment data with
existing Kubernetes resources using kubectl.

### Types

**SyncConfig** Configuration interface for defining ConfigMap/Secret properties,
labels, annotations, and output format.

**ConfigMap / Secret** Kubernetes resource type definitions following the
official API specifications.

**SyncOptions** Options for synchronizing with existing Kubernetes resources.

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main eserstack repository](https://github.com/eser/stack).
