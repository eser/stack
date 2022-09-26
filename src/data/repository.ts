// deno-lint-ignore no-explicit-any
interface Repository<T = unknown, K extends keyof any = "id"> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;

  add(data: Omit<T, K>): Promise<string>;
  update(id: string, data: Partial<T>): Promise<void>;
  replace(id: string, data: Omit<T, K>): Promise<void>;
  remove(id: string): Promise<void>;

  // TODO getCursor, bulkInsert, upsert, count, aggregate, etc.
}

export { type Repository };
