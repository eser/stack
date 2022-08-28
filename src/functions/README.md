# 🧱 [hex/functions](https://github.com/eserozvataf/hex/tree/development/src/functions)

## Package Information

hex/functions is a function runtime, which enables better portability between
platforms.

For further details such as requirements, license information and support guide,
please see [main hex repository](https://github.com/eserozvataf/hex).

## Component Roadmap

### MVP

- [x] ~Basic functions~
- [x] ~Input and context interfaces~
- [x] ~Middlewares~
- [x] ~CLI platform~
- [x] ~Runtime~
- [x] ~Web platform w/ oak~
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
import {
  dumper,
  executeFromCli,
  platforms,
  results,
} from "https://deno.land/x/hex/functions/mod.ts";

function main(input) {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
}

// will be removed in future versions
// propably will be replaced w/ export
dumper(executeFromCli(main));
```

### With Middlewares

```js
import {
  composer,
  dumper,
  executeFromCli,
  platforms,
  results,
} from "https://deno.land/x/hex/functions/mod.ts";

function initMiddleware(input, context, next) {
  context.vars.number = 1;

  return next();
}

function validationMiddleware(input, context, next) {
  if (input.params[0] === undefined) {
    return results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next();
}

function main(input, context) {
  const message = `hello ${context.vars.number} ${input.params[0]}`;

  return results.text(message);
}

const composed = composer(initMiddleware, validationMiddleware, main);

// will be removed in future versions
// propably will be replaced w/ export
dumper(executeFromCli(composed));
```
