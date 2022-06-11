import hex from "../../../mod.ts";

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
    return results.error(
      "parameter is not specified",
      new Error("parameter is not specified"),
    );
  }

  return next();
};

const main = function main(input, context) {
  const message = `hello ${context.vars.number} ${input.parameters[0]}`;

  return results.text(message);
};

const composed = composer(initMiddleware, validationMiddleware, main);

const runtime = createRuntime(platforms.cli);
runtime.execute(composed);
