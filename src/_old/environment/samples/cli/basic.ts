import * as environment from "../../mod.ts";

const context = environment.platforms.cli.createContext();
environment.platforms.cli.output(context, "hello world");
