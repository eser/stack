import cli from "../../src/platforms/cli.ts";
import { composer, results } from "../../src/mod.ts";

async function firstMiddleware(input, context, next) {
  context.vars.number = 1;

  return next();
}

async function secondMiddleware(input, context, next) {
  if (input.parameters[0] === "throw") {
    return results.error("requested by user", new Error("throw is specified"));
  }

  context.vars.number += 1;

  return next();
}

function main(input, context) {
  const message = `hello ${context.vars.number} ${input.parameters[0]}`;

  return results.text(message);
}

const composed = composer(firstMiddleware, secondMiddleware, main);

cli(composed);
