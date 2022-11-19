import * as hex from "../../mod.ts";

const initMiddleware = (_input, context, next) => {
  context.vars.number = 1;

  return next();
};

const validationMiddleware = (
  input,
  _context,
  next,
) => {
  if (input.params[0] === undefined) {
    return hex.functions.results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next();
};

const main = (input, context) => {
  const message = `hello ${context.vars?.number} ${input.params[0]}`;

  return hex.functions.results.text(message);
};

const composed = hex.functions.composer(
  initMiddleware,
  validationMiddleware,
  main,
);

hex.functions.dumper(
  hex.functions.executeFromCli(composed),
);
