<p align="center">
  <a href="https://github.com/eserozvataf/hex">
    <img alt="hex: a deno library" src="https://raw.githubusercontent.com/eserozvataf/hex/development/etc/logo.svg" width="849" />
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

|              Component              |       Area        |           Description            |
| ----------------------------------- | ----------------- | -------------------------------- |
| [Directives](src/lib/directives/)   | Rules             |                                  |
| [Standards](src/lib/standards/)     | Abstraction       |                                  |
| [FP](src/lib/fp/)                   | Functions Library | Tools for functional programming |
| [StdX](src/lib/stdx/)               | Functions Library | Encriched Standard Library       |
| [Data](src/lib/data/)               | Objects Library   | Data Objects and Patterns        |
| [Environment](src/lib/environment/) | Objects Library   | Environment adapters             |
| [Formatters](src/lib/formatters/)   | Objects Library   | Object serializers/deserializers |
| [CLI](src/lib/cli/)                 | Manager           | CLI library                      |
| [DI](src/lib/di/)                   | Manager           | Dependency injection library     |
| [Functions](src/lib/functions/)     | Manager           | Functions runtime                |
| [I18N](src/lib/i18n/)               | Manager           | Internationalization library     |
| [Options](src/lib/options/)         | Manager           | Configuration library            |

See the respective component page to figure out its specific usage.



# 🚀 Jumpstart

Ensure that [Deno](https://deno.land/) 1.27 or higher is installed on your
system first.

**Alternative I**:

Install hex cli globally first, then create a new project:

```sh
$ deno run -A https://hexfw.deno.dev

$ hex create my-project

Creating "hex framework web template 0.0.1" on my-project...
...
done.
```


**Alternative II**:

Without any preparation, invoke creating a new project remotely:

```sh
$ deno run -A https://hexfw.deno.dev create my-project

Creating "hex framework web template 0.0.1" on my-project...
...
done.
```


**Alternative III**:

Or run a hex routines directly from the resource:

```sh
$ deno run https://deno.land/x/hex/samples/lib-functions/basic.ts eser

{ payload: "hello eser" }
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

- Deno 1.27 or higher (https://deno.land/)


## License

Apache 2.0, for further details, please see [LICENSE](LICENSE) file.


## To Support

[Visit my GitHub Sponsors profile at github.com/sponsors/eserozvataf](https://github.com/sponsors/eserozvataf)
