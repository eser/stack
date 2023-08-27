import { type Repository } from "./repository.ts";

export interface Connection<T = unknown, TR = Repository<T>> {
  repository(id: string): TR;
}
