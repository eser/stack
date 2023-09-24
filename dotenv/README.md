# 🔐 [cool/dotenv](./)

`cool/dotenv` helps you load configurations from `.env.*` files and environment
variables, a practice based on **The 12-Factor App** methodology which
recommends separating configuration from code.

## 🚀 Getting Started with Environment Variables (ENV)

Environment variables (often shortened to env vars or env) are variables that
are available in all command line sessions and affect the behavior of the
applications on your system. They are essential for managing the configuration
of your applications separate from your code.

**The 12-Factor App** recommends storing config in environment variables

### The 12-Factor App

The 12-Factor App is a set of best practices designed to enable applications to
be built with portability and resilience when deployed to the web.
[Learn more about The 12-Factor App](https://12factor.net/).

## 🤔 What cool/dotenv does?

`cool/dotenv` helps you handle these configurations properly. While using
`cool/dotenv`, the environment variables are loaded from the following sources:

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

Below you'll find a list of features provided by `cool/dotenv` along with brief
descriptions and usage examples.

### Loading environment variables

**Basic usage:**

```ts
import { load } from "$cool/dotenv/mod.ts";

const vars = await load();
console.log(vars);
```

**Load from different directory:**

```ts
import { load } from "$cool/dotenv/mod.ts";

const vars = await load({ baseDir: "./config" });
console.log(vars);
```

### Configure an options object with environment reader

**Basic usage:**

```ts
import { configure, env } from "$cool/dotenv/mod.ts";

const options = await configure(
  (reader, acc) => {
    acc["env"] = reader[env];
    acc["port"] = reader.readInt("PORT", 8080);

    return acc;
  },
  {},
);
```

**With custom interfaces:**

```ts
import { configure, env } from "$cool/dotenv/mod.ts";

interface Options {
  env: string;
  port: number;
}

const options = await configure<Options>(
  (reader, acc) => {
    acc.env = reader[env];
    acc.port = reader.readInt("PORT", 8080);

    return acc;
  },
  {},
);
```

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main cool repository](https://github.com/eser/cool).
