interface Repository<T = unknown> {
  get(id: string): Promise<T | undefined>;
  getAll(): Promise<T[]>;

  add<R = T>(data: R): Promise<string>;
  update<R = T>(id: string, data: R): Promise<void>;
  replace<R = T>(id: string, data: R): Promise<void>;
  remove(id: string): Promise<void>;

  // TODO getCursor, bulkInsert, upsert, count, aggregate, etc.
}

export { type Repository };
