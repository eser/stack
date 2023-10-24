import { dev } from "../../dev.ts";
import { config } from "./config.ts";

await dev(import.meta.url, config);
