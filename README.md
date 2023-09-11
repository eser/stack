<p align="center">
  <a href="./">
    <img alt="cool: a deno ecosystem" src="./_etc/logo.svg" width="849" />
  </a>
</p>

# ⭐ Intro

✖️ **cool** is an ecosystem designed to promote best practices, a specific
philosophy, and enhanced portability across different platforms.

It is comprised of various sub-**component**s, each designed to work
harmoniously together, allowing developers to abstract their code for better
portability across different platforms. This encourages a functional programming
approach, enabling code to be written once and then run on various mainstream
environments such as CLI, bot platforms, cloud-function runtimes, and web APIs.

The reason we started to build this project is the feeling of a lack of a
JavaScript/TypeScript framework that is portable across web browsers, Deno,
Supabase, Netlify, AWS Lambda, and Cloudflare Workers. By adhering to WinterCG
guidelines and TC39 standards, we aim to provide a framework that is portable
across all these platforms.

## Sample (WIP)

```js
import { Runtime, Context } from "$cool/runtime/mod.ts";

const fn = (ctx: Context) => {
  const name = ctx.input.get("name");
  const db = ctx.di`db`;

  ctx.logger.info(`Hello ${name}!`);

  return ctx.results.json(db.query("SELECT * FROM users"));
};

const router = (ctx: Context) => {
  const path = ctx.input.get("path");

  switch (path) {
    case "/":
      return fn(ctx);
    default:
      return ctx.results.notFound();
  }
};

const runtime = new Runtime();
runtime.ci.register("db", new DatabaseConnection());
runtime.listen(router); // or runtime.execute(fn);
```

# 📂 Components

| Component                         | Area              | Description                                         |
| --------------------------------- | ----------------- | --------------------------------------------------- |
| 📓 [cool/directives](directives/) | Rules             | The ground rules adhered to by the entire ecosystem |
| 📑 [cool/standards](standards/)   | Abstraction       |                                                     |
| ⚙️ [cool/di](di/)                  | Manager           | Dependency injection container                      |
| 🧱 [cool/fp](fp/)                 | Functions Library | Tools for functional programming                    |
| 🔐 [cool/dotenv](dotenv/)         | Manager           | Load configurations from environment                |

<!--
| [hex/Data](hex/data/)               | Objects Library   | Data Objects and Patterns        |
| [hex/Environment](hex/environment/) | Objects Library   | Environment adapters             |
| [hex/Formatters](hex/formatters/)   | Objects Library   | Object serializers/deserializers |
| [hex/CLI](hex/cli/)                 | Manager           | CLI library                      |
| [hex/Functions](hex/functions/)     | Manager           | Functions runtime                |
| [hex/I18N](hex/i18n/)               | Manager           | Internationalization library     |
-->

See the respective component page to figure out its specific usage.

# 🚀 Jumpstart

Ensure that [Deno](https://deno.land/) 1.36 or higher is installed on your
system first.

**Alternative I**:

Install cool cli globally first, then create a new project:

```sh
$ deno run -A https://c00l.deno.dev

$ cool create my-cool-project

Creating "cool web project template 0.0.1" on my-cool-project...
...
done.
```

**Alternative II**:

Without any preparation, invoke creating a new project remotely:

```sh
$ deno run -A https://c00l.deno.dev create my-cool-project

Creating "cool web project template 0.0.1" on my-cool-project...
...
done.
```

**Alternative III**:

Or run a cool routines directly from the resource:

```sh
$ deno run https://deno.land/x/cool/hex/functions/samples/basic.ts eser

{ payload: "hello eser" }
```

# 📖 FAQ

## Want to report a bug or request a feature?

Please read through our [CONTRIBUTING.md](CONTRIBUTING.md) and report it using
[GitHub Issues](https://github.com/eser/cool/issues)!

## Want to contribute?

It is publicly open for any contribution. Bug fixes, new features and additional
components are welcome.

If you're not sure where to start, check out the issues labeled
`good first issue` and `help wanted`. We also recommend looking at closed ones
to get a sense of the kinds of issues you can tackle.

To contribute, fork the repo, push your changes to your fork, and then submit a
pull request.

## Requirements

- Deno 1.36 or higher (https://deno.land/)

## License

Apache 2.0, for further details, please see [LICENSE](LICENSE) file.

## To Support

[Visit my GitHub Sponsors profile at github.com/sponsors/eser](https://github.com/sponsors/eser)
