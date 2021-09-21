import hex from "../../../mod.ts";

async function handler(event, ...args) {
  if (event.type === "input") {
    const [param] = args;

    console.log(`new input: ${await param}`);
  }
}

const context = hex.environment.platforms.cli.createContext(handler);
hex.environment.platforms.cli.input(context, Deno.args);
hex.environment.platforms.cli.output(context, { name: "Eser" }, { formatter: "json" });
