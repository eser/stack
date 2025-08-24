# `eserstack` - The Portability Solution for Your Code! 🚀

[![JSR @eser](https://jsr.io/badges/@eser)](https://jsr.io/@eser)
[![codecov](https://codecov.io/gh/eser/stack/branch/main/graph/badge.svg?token=w6s3ODtULz)](https://codecov.io/gh/eser/stack)
[![Build Pipeline](https://github.com/eser/stack/actions/workflows/build.yml/badge.svg)](https://github.com/eser/stack/actions/workflows/build.yml)
[![Built with the Deno Standard Library](https://raw.githubusercontent.com/denoland/deno_std/main/badge.svg)](https://deno.land/std)

<p align="center">
  <a href="./">
    <img alt="eser stack javascript toolkit" src="./etc/cover.svg" width="849" />
  </a>
</p>

Step into a world where you never have to deal with portability and platform
issues. Whether you're targeting **web browsers**, **serverless platforms**,
**chatbots**, **CLI**, or multiple platforms simultaneously, eserstack ensures
**your code runs** flawlessly **everywhere**.

## 📖 Overview

`eserstack` is a JavaScript toolkit designed to uphold best practices and
enhance portability across different platforms.

Beyond being a toolkit, `eserstack` advocates for a philosophy that emphasizes
writing code driven by algorithms, design and patterns, not by platform-specific
implementation details.

While `eserstack` offers you a layer of abstraction that isolates you from the
platforms, **you can focus on your implementation**. Don't worry about the rest,
your solution will excel across diverse environments.

Every [component](#component-set) of `eserstack` is designed to work in harmony,
strives to offer you an intuitive and delightful development experience.

## 🌟 Why choose eserstack?

`eserstack` is meticulously designed for developers who:

- **Seek Portability**: If you've ever felt the need for a JavaScript/TypeScript
  framework that seamlessly works across web browsers, Deno, Supabase, Netlify,
  AWS Lambda and Cloudflare Workers, `eserstack` is your answer.
  [See the full list of supported platforms](#platform-support)

- **Love Functional Programming**: `eserstack` not only supports but encourages
  a functional programming approach. This means you can write your code once and
  run it on various platforms without modifications.
  [Dive into our functional programming tools](./fp/README.md)

- **Want Enhanced Testability**: With the removal of hard-coded dependencies and
  the promotion of loose coupling, `eserstack` enhances the testability of your
  codebase, ensuring that your applications run as expected.
  [Explore our dependency injection system](./di/README.md)

- **Desire a Unified Approach**: Instead of juggling multiple libraries and
  tools, `eserstack` provides a unified toolkit where each component works
  seamlessly with the others, ensuring a smoother development experience.
  [Check out our component set](#component-set)

- **Prioritize Best Practices**: If you've been struggling with maintaining best
  practices in your development process, `eserstack` is here to guide you. With
  built-in support for principles like 12factor and dependency injection, you
  can ensure that your code remains clean, maintainable, and scalable.
  [Learn more about our best practices approach](#best-practices)

## 📂 Components

### Component Set

| Component                              | Area              | Description                                         | Latest Version                                                                  |
| -------------------------------------- | ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| 📓 [@eser/directives](pkg/directives/) | Rules             | The ground rules adhered to by the entire ecosystem | -                                                                               |
| 📑 [@eser/standards](pkg/standards/)   | Abstraction       | Provides common abstraction layers for DI           | [![JSR](https://jsr.io/badges/@eser/standards)](https://jsr.io/@eser/standards) |
| ⚙️ [@eser/di](pkg/di/)                 | Manager           | Dependency injection system                         | [![JSR](https://jsr.io/badges/@eser/di)](https://jsr.io/@eser/di)               |
| 🧱 [@eser/fp](pkg/fp/)                 | Functions Library | Tools for functional programming                    | [![JSR](https://jsr.io/badges/@eser/fp)](https://jsr.io/@eser/fp)               |
| 🔐 [@eser/config](pkg/config/)         | Manager           | Load configurations from environment                | [![JSR](https://jsr.io/badges/@eser/config)](https://jsr.io/@eser/config)       |
| 〰️ [@eser/parsing](pkg/parsing/)       | Manager           | Parsing tools for various strings and streams       | [![JSR](https://jsr.io/badges/@eser/parsing)](https://jsr.io/@eser/parsing)     |

Visit the respective component page for detailed usage instructions.

### Our Goal / The Bigger Picture

We strive to run the following code seamlessly across
[all platforms we support](#platform-support):

```js
import { Runtime, Context } from "@eser/runtime";

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

Ensure that [Deno](https://deno.land/) 1.45 or higher is installed on your
system first.

First, install `cool cli` globally, then create a new project:

```sh
$ deno install -g jsr:@cool/cli

$ cool create my-project

Creating "cool web project template 0.0.1" on my-project...
...
done.
```

## 🙋🏻 FAQ

### Want to report a bug or request a feature?

If you're going to report a bug or request a new feature, please ensure first
that you comply with the conditions found under
[@eser/directives](https://github.com/eser/stack/blob/dev/pkg/directives/README.md).
After that, you can report an issue or request using
[GitHub Issues](https://github.com/eser/stack/issues). Thanks in advance.

### Want to contribute?

It is publicly open for any contribution from the community. Bug fixes, new
features and additional components are welcome.

If you're interested in becoming a contributor and enhancing the ecosystem,
please start by reading through our [CONTRIBUTING.md](CONTRIBUTING.md).

If you're not sure where to begin, take a look at the
[issues](https://github.com/eser/stack/issues) labeled `good first issue` and
`help wanted`. Reviewing closed issues can also give you a sense of the types of
contributions we're looking for and you can tackle.

If you're already an experienced OSS contributor, let's take you to the shortest
path: To contribute to the codebase, just fork the repo, push your changes to
your fork, and then submit a pull request.

### Requirements

- Deno 1.45 or higher (https://deno.land/)

### Versioning

This project follows [Semantic Versioning](https://semver.org/). For the
versions available, see the
[tags on this repository](https://github.com/eser/stack/tags).

### License

This project is licensed under the Apache 2.0 License. For further details,
please see the [LICENSE](LICENSE) file.

### To support the project...

[Visit my GitHub Sponsors profile at github.com/sponsors/eser](https://github.com/sponsors/eser)
