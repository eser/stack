import * as functions from "@hex/lib/functions/mod.ts";

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
    return functions.results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next();
};

const main = (input, context) => {
  const message = `hello ${context.vars?.number} ${input.params[0]}`;

  return functions.results.text(message);
};

const composed = functions.composer(
  initMiddleware,
  validationMiddleware,
  main,
);

functions.dumper(
  functions.executeFromCli(composed),
);
