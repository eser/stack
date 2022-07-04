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

_This project is currently in early stages of its development. Descriptions or
instructions are not mature yet as well as the project itself._

## Components

- [Directives](src/directives/)
- [Environment](src/environment/)
- [Formatters](src/formatters/)
- [FP](src/fp/)
- [Functions](src/functions/)
- [Services](src/services/)
- [Standards](src/standards/)

# Usage

See related component page to figure out its specific usage.

# FAQ

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

# Development

## Quick start

Ensure that `Deno` is installed on your system first.

Clone this git repo `git clone https://github.com/eserozvataf/hex.git` - and
checkout the [tagged release](https://github.com/eserozvataf/hex/releases) you'd
like to use.

Then run a sample file under `src/samples/` directory,

```sh
$ deno run src/functions/samples/basic.ts eser

hello eser
```

## Requirements

- Deno (https://deno.land/)

## License

Apache 2.0, for further details, please see [LICENSE](LICENSE) file.

## To Support

[Visit my patreon profile at patreon.com/eserozvataf](https://www.patreon.com/eserozvataf)
