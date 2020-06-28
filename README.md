# ✖️ [hex-functions](https://github.com/eserozvataf/hex-functions)

Function abstraction framework for better portability between platforms. Write your code once in functional approach, then run on mainstream environments such as cli, bot platforms, cloud-function runtimes and web apis.

*This project is in early stages of its development. Descriptions or instructions are not mature yet as well as the project itself.*

## Roadmap

### MVP

- [x] ~Basic functions~
- [x] ~Input and context interfaces~
- [x] ~Middlewares~
- [x] ~CLI platform~
- [x] ~Runtime~
- [ ] Hypertext format
- [ ] Web platform w/ Deno's http
- [ ] Telegram bot platform

### Next Milestones

- [ ] API Maturity
- [ ] AWS Lambda platform
- [ ] Knative platform
- [ ] Discord bot platform
- [ ] Slack bot platform
- [ ] Unit and integration testing utilities
- [ ] Dockerization
- [ ] Manifest files
- [ ] Kafka/queue events
- [ ] Scheduled events
- [ ] Deployments (to cloud providers)


See [eser.dev](https://eser.dev) for further development details (in Turkish).


## Usage

### Basic

```js
import { results } from "https://deno.land/x/hex/mod.ts";

export default function main(input) {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}
```

### With Middlewares

```js
import { composer, results } from "https://deno.land/x/hex/mod.ts";

function initMiddleware(input, context, next) {
  context.vars.number = 1;

  return next();
}

function validationMiddleware(input, context, next) {
  if (input.parameters[0] === undefined) {
    return results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next();
}

function main(input, context) {
  const message = `hello ${context.vars.number} ${input.parameters[0]}`;

  return results.text(message);
}

const composed = composer(initMiddleware, validationMiddleware, main);

export {
  composed as default,
};
```


## Quick start

Ensure that `Deno` is installed on your system first.

Clone this git repo `git clone
   https://github.com/eserozvataf/hex-functions.git` - and checkout the [tagged
   release](https://github.com/eserozvataf/hex-functions/releases) you'd like to
   use.

Then run a sample file under `samples/` directory,

```sh
$ deno run samples/cli/basic.ts eser

hello eser
```


## Todo List

See [GitHub Projects](https://github.com/eserozvataf/hex-functions/projects) for more.


## Requirements

* Deno (https://deno.land/)


## License

Apache 2.0, for further details, please see [LICENSE](LICENSE) file.


## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

It is publicly open for any contribution. Bugfixes, new features and extra modules are welcome.

* To contribute to code: Fork the repo, push your changes to your fork, and submit a pull request.
* To report a bug: If something does not work, please report it using [GitHub Issues](https://github.com/eserozvataf/hex-functions/issues).


## To Support

[Visit my patreon profile at patreon.com/eserozvataf](https://www.patreon.com/eserozvataf)
