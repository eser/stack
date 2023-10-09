import { dev } from "$cool/lime/src/dev/dev_command.ts";

await dev(import.meta.url, "./main.ts");
