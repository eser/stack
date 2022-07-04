import * as hex from "../../mod.ts";

const initMiddleware = function initMiddleware(input, context, next) {
  context.vars.number = 1;

  return next();
};

const validationMiddleware = function validationMiddleware(
  input,
  context,
  next,
) {
  if (input.parameters[0] === undefined) {
    return hex.functions.results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next();
};

const main = function main(input, context) {
  const message = `hello ${context.vars?.number} ${input.parameters[0]}`;

  return hex.functions.results.text(message);
};

const composed = hex.functions.composer(
  initMiddleware,
  validationMiddleware,
  main,
);

hex.functions.dumper(
  hex.functions.execute(composed),
);
