# 🔐 [@eser/config](./)

`@eser/config` helps you load configurations from `.env.*` files and environment
variables, a practice based on **The 12-Factor App** methodology which
recommends separating configuration from code.

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

## 🤔 What @eser/config offers?

`@eser/config` helps you handle these configurations properly. With using
`@eser/config`, the environment variables are loaded from the following sources:

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

Here you'll find a list of features provided by `@eser/config` along with brief
descriptions and usage examples.

### Loading environment variables

**Basic usage:**

```js
import * as config from "@eser/config";

const vars = await config.load();
console.log(vars);
```

**Load from different directory:**

```js
import * as config from "@eser/config";

const vars = await config.load({ baseDir: "./config" });
console.log(vars);
```

### Configuring an options object with environment reader

**Basic usage:**

```js
import * as config from "@eser/config";

const options = await config.configure(
  (reader, acc) => {
    acc["env"] = reader[config.env];
    acc["port"] = reader.readInt("PORT", 8080);

    return acc;
  },
  {},
);
```

**With custom interfaces:**

```js
import * as config from "@eser/config";

type Options = {
  env: string;
  port: number;
};

const options = await config.configure<Options>(
  (reader, acc) => {
    acc.env = reader[config.env];
    acc.port = reader.readInt("PORT", 8080);

    return acc;
  },
  {},
);
```

---

🔗 For further details such as requirements, licensing and support guide, please
visit the [main eserstack repository](https://github.com/eser/stack).
