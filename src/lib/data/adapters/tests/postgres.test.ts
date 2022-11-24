import { PostgresConnection } from "../postgres.ts";
import { asserts, bdd } from "./deps.ts";

type DummyCol = { id?: string; value: string; condition: boolean };
const dummy1: DummyCol = { id: "1", value: "foo", condition: false };
const dummy2: DummyCol = { id: "2", value: "bar", condition: false };

bdd.describe.ignore("hex/data/adapters/postgres", () => {
  // Connects postgres container, hex_test database - test table
  const uri = "postgres://root:password@localhost:5432/hex_test?sslmode=prefer";
  const TestConnection = new PostgresConnection<DummyCol>(uri);
  const TestRepo = TestConnection.repository("test");

  bdd.it("add", async () => {
    let got = await TestRepo.add(dummy1);
    asserts.equal(got, dummy1.id);

    got = await TestRepo.add(dummy2);
    asserts.equal(got, dummy2.id);

    await TestRepo.add({ condition: true });
  });

  bdd.it("get", async () => {
    let got = await TestRepo.get(dummy1.id!);
    asserts.equal(got!.value, dummy1.value);

    got = await TestRepo.get("nope");
    asserts.assertFalse(got);
  });

  bdd.it("getAll", async () => {
    const got = await TestRepo.getAll();
    asserts.equal(got![0].value, dummy1.value);
    asserts.equal(got![1].value, dummy2.value);
  });

  bdd.it("update", async () => {
    await TestRepo.update<DummyCol>(dummy1.id!, {
      value: "baz",
      condition: true,
    });
    const got = await TestRepo.get(dummy1.id!);
    asserts.equal(got!.condition, true);
    asserts.equal(got!.value, "baz");
  });

  bdd.it("delete", async () => {
    await TestRepo.remove(dummy1.id!);
    await TestRepo.remove(dummy2.id!);
    let got = await TestRepo.get(dummy1.id!);
    asserts.assertFalse(got);
    got = await TestRepo.get(dummy2.id!);
    asserts.assertFalse(got);
  });
});
