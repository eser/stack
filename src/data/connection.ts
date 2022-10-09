import { type Repository } from "./repository.ts";

interface Connection {
  // deno-lint-ignore no-explicit-any
  repository<T = unknown, K extends keyof any = "id">(
    id: string,
  ): Repository<T, K>;
}

export { type Connection };
