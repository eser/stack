import { type Repository } from "./repository.ts";

interface Connection {
  repository<T = unknown, K extends keyof any = "id">(
    id: string,
  ): Repository<T, K>;
}

export { type Connection };
