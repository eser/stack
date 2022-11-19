# ✖️ [hexfw-service](https://github.com/eserozvataf/hexfw-service)

Dext Service is a service boilerplate to enable developers to start coding their
**forward-compatible** backend projects immediately.

However, the motivation behind the project may sound familiar, and there are
tons of boilerplates already that serve this purpose, hexfw-service allows you to
run your code for **both** `Deno` and `Node.js`.

Since hexfw-service provides an orthogonal solution for `Deno` and `Node.js` code
sharing, it's a perfect boilerplate for developers who want to be able to stick
with modern tooling by using them immediately. hexfw-service simply runs on Deno's
powerful ecosystem, which providers many developer tools and libraries built-in.
Additionally, it allows you to compile your code in order to run on good old
`Node.js`.

## Features

- Built on [Deno](https://deno.land) and Oak. So it supports Modern Web APIs.
- Can be compiled to run on `Node.js` as well.
- Transpiles [TypeScript](https://www.typescriptlang.org/) and
  [React JSX](https://reactjs.org/) out of the box.
- Separated middleware and actions.
- Simple TDD convention and testing environment.
- Ready to debug on VS Code or Chromium Inspector.
- Ready to containerize.
- [WIP] Development mode.
- [WIP] MongoDB connection support.
- [WIP] JWT authentication middleware.
- [TODO] Built-in [Swagger](https://swagger.io) support.

## Quick start

Ensure that `Deno` or `Node.js` is installed on your system first.

Clone this git repo `git clone https://github.com/eserozvataf/hexfw-service.git` -
and checkout the
[tagged release](https://github.com/eserozvataf/hexfw-service/releases) you'd like
to use.

**Important**: local env files (i.e., `.env.local`) is git-ignored, so you can
have secret your sensitive environment variables by creating local copies of
environment variables before running the service.

## Commands

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `deno task build`         | Compiles codebase to allow its execution on Node.js  |
| `deno task start`         | Start application backend                            |
| `deno task dev`           | Debug application with chromium inspector or VS Code |
| `deno task test`          | Execute unit tests                                   |
| `deno task test:coverage` | Execute unit tests with coverage report              |
| `deno task bench`         | Executes benchmark testing                           |
| `deno task cleanup`       | Cleans up generated build files                      |
| `deno task dockerize`     | Start application in a docker container              |
| `deno lint`               | Executes linter                                      |
| `deno fmt`                | Executes formatter                                   |

## Running the service

With `Deno`:

```bash
deno task start
```

With `Node.js`:

```bash
deno task build   # build it first in order to run on Node.js
node dist/script/app.js
```

## Todo List

See [GitHub Projects](https://github.com/eserozvataf/hexfw-service/projects) for
more.

## Requirements

- Deno (https://deno.land/) or,
- Node.js (https://nodejs.dev/)

## License

Apache 2.0, for further details, please see [LICENSE](LICENSE) file.

## Credits

Thanks [Oak](https://github.com/oakserver/oak) team for awesome project. Also
their `ErrorEvent` shim (MIT-licensed) is used in this project.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

It is publicly open for any contribution. Bugfixes, new features and extra
modules are welcome.

- To contribute to code: Fork the repo, push your changes to your fork, and
  submit a pull request.
- To report a bug: If something does not work, please report it using
  [GitHub Issues](https://github.com/eserozvataf/hexfw-service/issues).

## To Support

[Visit my GitHub Sponsors profile at github.com/sponsors/eserozvataf](https://github.com/sponsors/eserozvataf)
