import { type Repository } from "./repository.ts";

interface Connection<T = unknown, TR = Repository<T>> {
  repository(id: string): TR;
}

export { type Connection };
