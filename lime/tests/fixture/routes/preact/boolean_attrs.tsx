import { defineRoute } from "$cool/lime/server.ts";
import { FormIsland } from "$cool/lime/tests/fixture/islands/FormIsland.tsx";

export default defineRoute(() => {
  return (
    <div>
      <h1>Boolean attributes</h1>
      <p>All input elements should be checked or selected</p>
      <FormIsland>
        <p>
          <label htmlFor="check">
            checked
          </label>
          <input name="check" type="checkbox" checked />
        </p>
        <p>
          <label htmlFor="text">
            is required
          </label>
          <input name="text" type="text" required />
        </p>
        <p>
          <label htmlFor="foo-1">
            not selected
          </label>
          <input id="foo-1" type="radio" name="foo" value="1" />
          <label htmlFor="foo-2">
            selected
          </label>

          <input id="foo-2" type="radio" name="foo" value="2" checked />
        </p>
        <p>
          <label htmlFor="select">
            select value should be "bar"
          </label>
          <select name="select">
            <option value="foo">foo</option>
            <option value="bar" selected>bar</option>
          </select>
        </p>
      </FormIsland>
    </div>
  );
});
