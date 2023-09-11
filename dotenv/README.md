# 🔐 [cool/dotenv](./)

## Component Information

cool/dotenv helps you load configurations from `.env.*` files and environment
variables, a practice based on the 12-Factor App methodology which recommends
separating configuration from code.

For further details such as requirements, license information and support guide,
please see [main cool repository](https://github.com/eser/cool).

## Environment Variables

Environment variables are variables that are available in all command line
sessions and affect the behavior of the applications on your system. They are
essential for managing the configuration of your applications separate from your
code.

The environment variables are loaded from the following files:

- Environment variables
- `.env.$(ENV).local` - Local overrides of environment-specific settings.
- `.env.local` - Local overrides. This file is loaded for all environments
  **except "test"**.
- `.env.$(ENV)` - Environment-specific settings.
- `.env` - The Original®

These files are loaded in the order listed above. The first value set (either
from file or environment variable) takes precedence. That means you can use the
`.env` file to store default values for all environments and
`.env.development.local` to override them for development.

## Usage

With cool/dotenv, you may load environment configurations.

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
