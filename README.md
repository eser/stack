<p align="center">
  <a href="https://github.com/eserozvataf/hex">
    <img alt="hex: a deno library" src="./etc/logo.png" width="849" />
  </a>
</p>

# Intro

✖️ **hex** is an ecosystem delivering practices, philosophy and portability.

hex consists of a set of **component**s that are designed to be used together.
These sub-components enable developers to abstract their codes for better
portability between platforms. Encourages ones to write codes once in functional
approach, then run on mainstream environments such as cli, bot platforms,
cloud-function runtimes and web apis.


# ⚙ Components

| Component                       | Area              | Description                       |
|---------------------------------|-------------------|-----------------------------------|
| [Directives](src/directives/)   | Rules             |                                   |
| [Standards](src/standards/)     | Abstraction       |                                   |
| [FP](src/fp/)                   | Functions Library | Tools for functional programming  |
| [Data](src/data/)               | Objects Library   | Data Objects and Patterns         |
| [Environment](src/environment/) | Objects Library   | Environment adapters              |
| [Formatters](src/formatters/)   | Objects Library   | Object serializers/deserializers  |
| [Options](src/options/)         | Manager           | Configuration library             |
| [DI](src/di/)                   | Manager           | Dependency injection library      |
| [I18N](src/i18n/)               | Manager           | Internationalization library      |
| [Functions](src/functions/)     | Manager           | Functions runtime                 |
| [Service](src/service/)         | Framework         | A micro http framework            |
| [Web](src/web/)                 | Framework         | A web framework implementation    |


See the respective component page to figure out its specific usage.


# 🚀 Jumpstart

Ensure that [Deno](https://deno.land/) 1.25 or higher is installed on your system first.

Clone this git repo `git clone https://github.com/eserozvataf/hex.git` - and
checkout the [tagged release](https://github.com/eserozvataf/hex/releases) you'd
like to use.

Then run a sample file under `src/functions/samples/` directory,

```sh
$ deno run src/functions/samples/basic.ts eser

hello eser
```


# 📖 FAQ

## Want to report a bug or request a feature?

Please read through our [CONTRIBUTING.md](CONTRIBUTING.md) and report it using
[GitHub Issues](https://github.com/eserozvataf/hex/issues)!

## Want to contribute?

It is publicly open for any contribution. Bugfixes, new features and extra
components are welcome.

Check out issues with the `good first issue` and `help wanted` label if you are
not sure how to begin. We suggest also looking at the closed ones to get a sense
of the kinds of issues you can tackle.

Fork the repo, push your changes to your fork, and submit a pull request.

## Requirements

- Deno 1.25 or higher (https://deno.land/)

## License

Apache 2.0, for further details, please see [LICENSE](LICENSE) file.

## To Support

[Visit my GitHub Sponsors profile at github.com/sponsors/eserozvataf](https://github.com/sponsors/eserozvataf)
