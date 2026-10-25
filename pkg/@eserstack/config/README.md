# 🔐 [@eserstack/config](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/config` is published
> on npm under the same name (`pnpm add @eserstack/config`); the JSR versions
> stay available but get no updates.

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/config`

`@eserstack/config` helps you load configurations from `.env.*` files and
environment variables, a practice based on **The 12-Factor App** methodology
which recommends separating configuration from code.

## 🚀 Getting Started with Environment Variables (ENV)

Environment variables (often shortened to env vars or env) are variables
available in all command line sessions and affect the behavior of the
applications on your system. They are essential for managing the configuration
of your applications separate from your code.

**The 12-Factor App** methodology recommends storing configurations in
environment variables.

### The 12-Factor App

The 12-Factor App is a set of best practices designed to enable applications to
be built with portability and resilience when deployed to the web.
[Learn more about The 12-Factor App](https://12factor.net/).

## 🤔 What @eserstack/config offers?

`@eserstack/config` helps you handle these configurations properly. With using
`@eserstack/config`, the environment variables are loaded from the following
sources:

- Environment variables that passed to the Deno process.
- Environment variables defined by the system's shell.
- `.env.$(ENV).local` file - Local overrides of environment-specific settings.
- `.env.local` file - Local overrides. This file is loaded for all environments
  **except "test"**.
- `.env.$(ENV)` file - Environment-specific settings.
- `.env` file - The default configuration file.

These files are loaded in the order listed above. The first value set (either
from file or environment variable) takes precedence. That means you can use the
`.env` file to store default values for all environments and
`.env.development.local` to override them for development.

## 🛠 Usage and API Reference

Here you'll find a list of features provided by `@eserstack/config` along with
brief descriptions and usage examples.

### Loading environment variables

The `.env` loader lives in the `@eserstack/config/dotenv` entry point. `load()`
returns a `Map` of variable names to values.

**Basic usage:**

```typescript
import * as dotenv from "@eserstack/config/dotenv";

const vars = await dotenv.load();
console.log(vars.get("PORT"));
```

**Load from different directory:**

```typescript
import * as dotenv from "@eserstack/config/dotenv";

const vars = await dotenv.load({ baseDir: "./config" });
console.log(vars.get("PORT"));
```

### Configuring an options object with environment reader

**Basic usage:**

```typescript
import * as dotenv from "@eserstack/config/dotenv";

const options = await dotenv.configure<Record<string, unknown>>(
  (reader, acc) => {
    acc["env"] = reader.getCurrentEnv();
    acc["port"] = reader.readInt("PORT", 8080);

    return acc;
  },
  {},
);
```

**With custom interfaces:**

```typescript
import * as dotenv from "@eserstack/config/dotenv";

type Options = {
  env: string;
  port: number;
};

const options = await dotenv.configure<Options>((reader, acc) => {
  acc.env = reader.getCurrentEnv();
  acc.port = reader.readInt("PORT", 8080);

  return acc;
}, {});
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- dotenv `load()`, `configure()` and `parseEnvFromFile()` read values as written
  instead of running `decodeURIComponent` over them, and a lone `%` no longer
  throws. Before: `NAME=hello%20world`. After: `NAME="hello world"`.
- dotenv `load()` takes the environment name from the value of the first set,
  non-empty variable in `envVars` (`ENV`, `APP_ENV`, `DENO_ENV`, `NODE_ENV` by
  default) and honours `options.envVars`. It used to use the variable's name, so
  `ENV=production` loaded `.env.ENV`. Rename such a file after the value:
  `.env.ENV` becomes `.env.production`.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
