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
    this.client = new mongo.MongoClient();
    this.database = await this.client.connect(this.uri);
  }

  repository<T = unknown, K extends keyof any = "_id">(
    id: string,
  ): Repository<T, K> {
    if (this.database === undefined) {
      throw new Error("Database is not connected.");
    }

    const collection = this.database.collection<T>(id);

    return new MongoDbRepository<T>(collection) as unknown as Repository<T, K>;
  }
}

class MongoDbRepository<T = mongo.Bson.Document>
  implements Repository<T, "_id"> {
  collection: mongo.Collection<T>;

  constructor(collection: mongo.Collection<T>) {
    this.collection = collection;
  }

  get(id: string): Promise<T | undefined> {
    return this.collection.findOne({
      _id: new mongo.ObjectId(id),
    });
  }

  getAll(): Promise<T[]> {
    return this.collection.find().toArray();
  }

  async add(data: Omit<T, "_id">): Promise<string> {
    const id = await this.collection.insertOne(data);

    return String(id);
  }

  async update(id: string, data: Partial<T>): Promise<void> {
    await this.collection.updateOne(
      { _id: new mongo.ObjectId(id) },
      // @ts-ignore a bug in type definition
      { $set: data },
    );
  }

  async replace(id: string, data: Omit<T, "_id">): Promise<void> {
    await this.collection.replaceOne(
      { _id: new mongo.ObjectId(id) },
      // @ts-ignore a bug in type definition
      data,
    );
  }

  async remove(id: string): Promise<void> {
    await this.collection.deleteOne(
      { _id: new mongo.ObjectId(id) },
    );
  }
}

export { MongoDbConnection, MongoDbRepository };
