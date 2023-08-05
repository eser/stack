import { mongo } from "../deps.ts";
import { type Connection } from "../connection.ts";
import { type Repository } from "../repository.ts";

// deno-lint-ignore no-empty-interface
interface MongoDocument extends mongo.Bson.Document {
}

class MongoDbConnection<T extends MongoDocument>
  implements Connection<T, MongoDbRepository<T>> {
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

  repository(id: string) {
    return new MongoDbRepository<T>(this, id);
  }
}

class MongoDbRepository<T extends MongoDocument> implements Repository<T> {
  connection: MongoDbConnection<T>;
  collectionName: string;

  constructor(connection: MongoDbConnection<T>, collectionName: string) {
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

  async find<F>(filter: F): Promise<T | undefined> {
    const collection = await this.getCollection();

    return collection.findOne(filter as mongo.Filter<T> | undefined);
  }

  async findAll<F>(filter: F): Promise<T[]> {
    const collection = await this.getCollection();

    return collection.find(filter as mongo.Filter<T> | undefined).toArray();
  }

  async add<R = T>(data: R): Promise<string> {
    const collection = await this.getCollection();

    // @ts-ignore a bug in type definition
    const id = await collection.insertOne(data);

    return String(id);
  }

  async update<R = T>(id: string, data: R): Promise<void> {
    const collection = await this.getCollection();

    await collection.updateOne(
      { _id: new mongo.ObjectId(id) },
      // @ts-ignore a bug in type definition
      { $set: data },
    );
  }

  async replace<R = T>(id: string, data: R): Promise<void> {
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
