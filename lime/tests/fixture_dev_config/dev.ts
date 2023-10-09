import { dev } from "$cool/lime/src/dev/dev_command.ts";
import config from "./config.ts";

await dev(import.meta.url, "./main.ts", config);
