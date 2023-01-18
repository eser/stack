import { assert, bdd } from "./deps.ts";
import { applicationJsonFormatter } from "../application-json.ts";

bdd.describe("hex/lib/formatters/application-json", () => {
  bdd.it("simple serialization", async () => {
    const deserialized = {
      test: 123,
      rest: [4, 5, 6],
    };

    const serialized = await applicationJsonFormatter.serialize(deserialized);
    const expected = `{
  "test": 123,
  "rest": [
    4,
    5,
    6
  ]
}`;

    assert.assertEquals(serialized, expected);
  });

  bdd.it("empty serialization", async () => {
    const serialized = await applicationJsonFormatter.serialize(undefined);
    const expected = "";

    assert.assertEquals(serialized, expected);
  });

  bdd.it("error serialization", async () => {
    const error = new Error("test error");

    const serialized = await applicationJsonFormatter.serialize(error);
    const expected = `{
  "stack": ${JSON.stringify(error.stack)},
  "message": "test error"
}`;

    assert.assertEquals(serialized, expected);
  });

  bdd.it("simple deserialization", async () => {
    const serialized = `{
  "test": 123,
  "rest": [
    4,
    5,
    6
  ]
}`;
    const deserialized = await applicationJsonFormatter.deserialize!(
      serialized,
    );
    const expected = {
      test: 123,
      rest: [4, 5, 6],
    };

    assert.assertEquals(deserialized, expected);
  });
});
