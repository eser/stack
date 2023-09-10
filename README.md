<p align="center">
  <a href="./">
    <img alt="cool: a deno ecosystem" src="./_etc/logo.svg" width="849" />
  </a>
</p>

# Intro

✖️ **cool** is an ecosystem delivering practices, philosophy and portability.

cool consists of a set of **component**s that are designed to be used together.
These sub-components enable developers to abstract their codes for better
portability between platforms. Encourages ones to write codes once in functional
approach, then run on mainstream environments such as cli, bot platforms,
cloud-function runtimes and web apis.

# ⚙ Components

| Component                           | Area              | Description                      |
| ----------------------------------- | ----------------- | -------------------------------- |
| [Directives](directives/)           | Rules             |                                  |
| [Standards](standards/)             | Abstraction       |                                  |
| [hex/FP](hex/fp/)                   | Functions Library | Tools for functional programming |
| [hex/StdX](hex/stdx/)               | Functions Library | Encriched Standard Library       |
| [hex/Data](hex/data/)               | Objects Library   | Data Objects and Patterns        |
| [hex/Environment](hex/environment/) | Objects Library   | Environment adapters             |
| [hex/Formatters](hex/formatters/)   | Objects Library   | Object serializers/deserializers |
| [hex/CLI](hex/cli/)                 | Manager           | CLI library                      |
| [hex/DI](hex/di/)                   | Manager           | Dependency injection library     |
| [hex/Functions](hex/functions/)     | Manager           | Functions runtime                |
| [hex/I18N](hex/i18n/)               | Manager           | Internationalization library     |
| [hex/Options](hex/options/)         | Manager           | Configuration library            |

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
