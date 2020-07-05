import { composer, results, createRuntime, cli } from "../../mod.ts";

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

const runtime = createRuntime(cli);
runtime.execute(composed);
