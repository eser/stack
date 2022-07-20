import { asserts } from "./deps.ts";
import applicationJsonFormatter from "../application-json.ts";

Deno.test("hex/formatters/application-json:simple serialization", async () => {
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

  asserts.assertEquals(serialized, expected);
});

Deno.test("hex/formatters/application-json:empty serialization", async () => {
  const serialized = await applicationJsonFormatter.serialize(undefined);
  const expected = "";

  asserts.assertEquals(serialized, expected);
});

Deno.test("hex/formatters/application-json:error serialization", async () => {
  const error = new Error("test error");

  const serialized = await applicationJsonFormatter.serialize(error);
  const expected = `{
  "stack": ${JSON.stringify(error.stack)},
  "message": "test error"
}`;

  asserts.assertEquals(serialized, expected);
});

Deno.test("hex/formatters/application-json:simple deserialization", async () => {
  const serialized = `{
  "test": 123,
  "rest": [
    4,
    5,
    6
  ]
}`;
  const deserialized = await applicationJsonFormatter.deserialize!(serialized);
  const expected = {
    test: 123,
    rest: [4, 5, 6],
  };

  asserts.assertEquals(deserialized, expected);
});
