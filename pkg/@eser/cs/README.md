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
deno run -A jsr:@eser/cs/cli generate --name my-config --env-file .env
```

**Generate a Secret with namespace and JSON format:**

```bash
deno run -A jsr:@eser/cs/cli generate --name my-secret -n production --env-file .env.prod --format json
```

**Save output to a file:**

```bash
deno run -A jsr:@eser/cs/cli generate --name my-config --env-file .env --output configmap.yaml
```

**Sync with existing Kubernetes resource:**

```bash
deno run -A jsr:@eser/cs/cli sync configmap/my-existing-config --env-file .env.update
```

### Programmatic Usage

**Generate ConfigMap programmatically:**

```js
import { generate } from "@eser/cs";

const configMapYaml = await generate({
  name: "my-app-config",
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

### Configuration File Usage

Create a `k8s.yaml` configuration file:

```yaml
configMap:
  name: my-app-config
  namespace: default
  envFile: .env
  labels:
    app: my-application
    version: "1.0"
  annotations:
    description: "Configuration for my application"
output:
  format: yaml
  pretty: true
```

Then use it with the CLI:

```bash
deno run -A jsr:@eser/cs/cli generate --config k8s.yaml
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

- `--name <name>`: ConfigMap/Secret name (required)
- `--namespace <ns>`: Kubernetes namespace
- `--env-file <path>`: Path to environment file
- `--format <format>`: Output format (yaml/json)
- `--output <path>`: Output file path
- `--config <path>`: Configuration file path

**sync**

- `<resource>`: Resource reference (e.g., `configmap/name`, `secret/name`)
- `--namespace <ns>`: Kubernetes namespace
- `--env-file <path>`: Path to environment file
- `--format <format>`: Output format (yaml/json)
- `--output <path>`: Output file path

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
