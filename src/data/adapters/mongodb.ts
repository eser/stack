import { mongo } from "../deps.ts";
import { type Connection } from "../connection.ts";
import { type Repository } from "../repository.ts";

class MongoDbConnection implements Connection {
  uri: string;
  client?: mongo.MongoClient;
  database?: mongo.Database;

  constructor(uri: string) {
    this.uri = uri;
  }

  async connect() {
    if (this.client !== undefined) {
      return;
    }

    this.client = new mongo.MongoClient();
    this.database = await this.client.connect(this.uri);
  }

  // deno-lint-ignore no-explicit-any
  repository<T = unknown, K extends keyof any = "_id">(
    id: string,
  ): Repository<T, K> {
    return new MongoDbRepository<T>(this, id) as unknown as Repository<T, K>;
  }
}

class MongoDbRepository<T = mongo.Bson.Document>
  implements Repository<T, "_id"> {
  connection: MongoDbConnection;
  collectionName: string;

  constructor(connection: MongoDbConnection, collectionName: string) {
    this.connection = connection;
    this.collectionName = collectionName;
  }

  async getCollection(): Promise<mongo.Collection<T>> {
    await this.connection.connect();

    return this.connection.database!.collection<T>(this.collectionName);
  }

  async get(id: string): Promise<T | undefined> {
    const collection = await this.getCollection();

    return collection.findOne({
      _id: new mongo.ObjectId(id),
    });
  }

  async getAll(): Promise<T[]> {
    const collection = await this.getCollection();

    return collection.find().toArray();
  }

  async add(data: Omit<T, "_id">): Promise<string> {
    const collection = await this.getCollection();

    const id = await collection.insertOne(data);

    return String(id);
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    const collection = await this.getCollection();

    await collection.updateOne(
      { _id: new mongo.ObjectId(id) },
      // @ts-ignore a bug in type definition
      { $set: data },
    );
  }

  async replace(id: string, data: Omit<T, "_id">): Promise<void> {
    const collection = await this.getCollection();

    await collection.replaceOne(
      { _id: new mongo.ObjectId(id) },
      // @ts-ignore a bug in type definition
      data,
    );
  }

  async remove(id: string): Promise<void> {
    const collection = await this.getCollection();

    await collection.deleteOne(
      { _id: new mongo.ObjectId(id) },
    );
  }
}

export { MongoDbConnection, MongoDbRepository };
