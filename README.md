<p align="center">
  <a href="./">
    <img alt="cool: a deno ecosystem" src="./_etc/logo.svg" width="849" />
  </a>
</p>

## 📖 Overview

`cool` is an ecosystem designed to promote best practices, a specific
philosophy, and enhanced portability across different platforms.

It comprises various [sub-components](#-components), each designed to work
seamlessly together, allowing developers to abstract their code for better
portability across different platforms. This encourages a functional programming
approach, enabling code to be written once and then run on various mainstream
environments such as CLI, bot platforms, cloud-function runtimes and web APIs.

## 🌟 Why choose cool?

`cool` is meticulously designed for developers who:

- **Seek Portability**: If you've ever felt the need for a JavaScript/TypeScript
  framework that seamlessly works across web browsers, Deno, Supabase, Netlify,
  AWS Lambda and Cloudflare Workers, `cool` is your answer.
  [See the full list of supported platforms](#platform-support)

- **Love Functional Programming**: `cool` not only supports but encourages a
  functional programming approach. This means you can write your code once and
  run it on various platforms without modifications.
  [Dive into our functional programming tools](./fp/)

- **Want Enhanced Testability**: With the removal of hard-coded dependencies and
  the promotion of loose coupling, `cool` enhances the testability of your
  codebase, ensuring that your applications run as expected.
  [Explore our dependency injection system](./di/)

- **Desire a Unified Approach**: Instead of juggling multiple libraries and
  tools, `cool` provides a unified ecosystem where each component works
  harmoniously with the others, ensuring a smoother development experience.
  [Check out our component set](#component-set)

## 📂 Components

### Component Set

| Component                         | Area              | Description                                         |
| --------------------------------- | ----------------- | --------------------------------------------------- |
| 📓 [cool/directives](directives/) | Rules             | The ground rules adhered to by the entire ecosystem |
| 📑 [cool/standards](standards/)   | Abstraction       | Provides common abstraction layers for DI           |
| ⚙️ [cool/di](di/)                  | Manager           | Dependency injection system                         |
| 🧱 [cool/fp](fp/)                 | Functions Library | Tools for functional programming                    |
| 🔐 [cool/dotenv](dotenv/)         | Manager           | Load configurations from environment                |
| 〰️ [cool/parsing](parsing/)       | Manager           | Parsing tools for various strings and streams       |

Visit the respective component page for detailed usage instructions.

### Our Goal / The Bigger Picture

We strive to run the following code seamlessly across
[all platforms we support](#platform-support):

```js
import { Runtime, Context } from "$cool/runtime/mod.ts";

const home = (ctx: Context) => {
  return ctx.results.jsx(<h1>Hello there!</h1>);
};

const profile = (ctx: Context) => {
  const slug = ctx.input.param("id");
  const db = ctx.di`db`;

  ctx.logger.info(`Visiting the profile of ${slug}!`);

  return ctx.results.json(db.query("SELECT * FROM users WHERE slug=:slug", { slug }));
};

const router = (ctx: Context) => {
  switch (true) {
    case ctx.route.match("/"):
      return home(ctx);
    case ctx.route.match("/:id"):
      return profile(ctx);
    default:
      return ctx.results.notFound();
  }
};

const runtime = new Runtime();
runtime.ci.register("db", new DatabaseConnection());
runtime.listen(router); // or runtime.execute(fn);
```

### Platform Support

Since the reason we started to build this project is the feeling of a lack of a
JavaScript/TypeScript framework that is portable across many platforms, we're
always looking for the widen this list. By adhering to
[WinterCG guidelines](https://wintercg.org/) and
[TC39 standards](https://tc39.es/), we strive to provide a framework that is
portable across all these platforms.

- [x] Deno
- [ ] Node.js
- [x] Web Browsers
- [ ] Service Workers
- [x] Deno Deploy
- [ ] Cloudflare Workers
- [ ] Supabase Functions
- [ ] Netlify
- [ ] AWS Lambda
- [ ] Google Cloud Functions
- [ ] Azure Functions
- [ ] Telegram Bots
- [ ] Discord Bots
- [ ] Slack Bots

...and all other platforms that comply with the
[WinterCG guidelines](https://wintercg.org/).

## 🚀 Jumpstart

Ensure that [Deno](https://deno.land/) 1.36 or higher is installed on your
system first.

First, install `cool cli` globally, then create a new project:

```sh
$ deno install -A -n cool https://c00l.deno.dev

$ cool create my-cool-project

Creating "cool web project template 0.0.1" on my-cool-project...
...
done.
```

## 🙋🏻 FAQ

### Want to report a bug or request a feature?

If you're going to report a bug or request a new feature, please ensure first
that you comply with the conditions found under
[cool/directives](https://github.com/eser/cool/blob/dev/directives/README.md).
After that, you can report an issue or request using
[GitHub Issues](https://github.com/eser/cool/issues). Thanks in advance.

### Want to contribute?

It is publicly open for any contribution from the community. Bug fixes, new
features and additional components are welcome.

If you're interested in becoming a contributor and enhancing the ecosystem,
please start by reading through our [CONTRIBUTING.md](CONTRIBUTING.md).

If you're not sure where to begin, take a look at the
[issues](https://github.com/eser/cool/issues) labeled `good first issue` and
`help wanted`. Reviewing closed issues can also give you a sense of the types of
contributions we're looking for and you can tackle.

If you're already an experienced OSS contributor, let's take you to the shortest
path: To contribute to the codebase, just fork the repo, push your changes to
your fork, and then submit a pull request.

### Requirements

- Deno 1.36 or higher (https://deno.land/)

### Versioning

This project follows [Semantic Versioning](https://semver.org/). For the
versions available, see the
[tags on this repository](https://github.com/eser/cool/tags).

### License

This project is licensed under the Apache 2.0 License. For further details,
please see the [LICENSE](LICENSE) file.

### To support the project...

[Visit my GitHub Sponsors profile at github.com/sponsors/eser](https://github.com/sponsors/eser)
