import { postgres } from "../deps.ts";
import { bld } from "../deps.ts";
import { type Connection } from "../connection.ts";
import { type Repository } from "../repository.ts";

class PostgresConnection<T = unknown>
  implements Connection<T, PostgresRepository<T>> {
  uri: string;
  client?: postgres.Client;

  constructor(uri: string) {
    this.uri = uri;
  }

  async connect() {
    this.client = new postgres.Client(this.uri);
    await this.client.connect();
  }

  async end() {
    if (this.client !== undefined) {
      await this.client!.end();
    }
  }

  repository(table: string): PostgresRepository<T> {
    return new PostgresRepository<T>(this, table);
  }
}

class PostgresRepository<T> implements Repository<T> {
  connection: PostgresConnection;
  table: string;

  constructor(
    connection: PostgresConnection<T>,
    table: string,
  ) {
    this.connection = connection;
    this.table = table;
  }

  async get(id: string): Promise<T | undefined> {
    await this.connection.connect();

    const query = new bld.Query();
    const result = await this.connection.client?.queryObject<T>(
      query.table(this.table)
        .select()
        .where("id", "=", id)
        .build(),
    ).finally(() => this.connection.end());

    return result!.rows[0];
  }

  async getAll(): Promise<T[]> {
    await this.connection.connect();

    const query = new bld.Query();
    const result = await this.connection.client?.queryObject<T>(
      query
        .table(this.table)
        .select()
        .build(),
    ).finally(() => this.connection.end());

    return result!.rows;
  }

  find<F>(_filter: F): Promise<T | undefined> {
    throw new Error("not implemented yet.");
  }

  findAll<F>(_filter: F): Promise<T[]> {
    throw new Error("not implemented yet.");
  }

  async add<R = T>(data: R): Promise<string> {
    await this.connection.connect();

    const values = Object.values(data as Record<string, unknown>);

    const query = new bld.Query();
    const result = await this.connection.client?.queryObject<T>(
      query
        .table(this.table)
        .insert(data as Record<string, unknown>)
        .returning("id")
        .build(),
      [...values],
    ).finally(() => this.connection.end());

    type ResultType = T & { id: string };
    return (result!.rows[0] as ResultType).id;
  }

  async update<R = T>(id: string, data: R): Promise<void> {
    await this.connection.connect();

    const query = new bld.Query();
    await this.connection.client?.queryObject<T>(
      query
        .table(this.table)
        .update(data as Record<string, unknown>)
        .where("id", "=", id)
        .build(),
    ).finally(() => this.connection.end());
  }

  replace<R = T>(id: string, data: R): Promise<void> {
    return this.update(id, data);
  }

  async remove(id: string): Promise<void> {
    await this.connection.connect();

    const query = new bld.Query();
    await this.connection.client?.queryObject<T>(
      query
        .table(this.table)
        .delete()
        .where("id", "=", id)
        .build(),
    ).finally(() => this.connection.end());
  }
}

export { PostgresConnection, PostgresRepository };
