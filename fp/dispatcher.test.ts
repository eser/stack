import { assert, bdd } from "../deps.ts";
import { dispatcher, type LogType, type NextType } from "./dispatcher.ts";

type StateType = Record<string, number>;

bdd.describe("cool/fp/dispatcher", () => {
  bdd.it("basic", async () => {
    const initialState = { quarter: 1, year: 2018, sum: 1 };

    const actionAdd5 = (state: StateType, next: NextType<StateType>) =>
      next({ ...state, sum: (state["sum"] ?? 0) + 5 });
    const actionDiv2 = (state: StateType, next: NextType<StateType>) =>
      next({ ...state, sum: (state["sum"] ?? 0) / 2 });

    const result = await dispatcher(initialState, [actionAdd5, actionDiv2]);

    assert.assertEquals(result, { quarter: 1, year: 2018, sum: 3 });
  });

  bdd.it("logger", async () => {
    const initialState = { quarter: 1, year: 2018, sum: 1 };

    const actionAdd5 = (state: StateType, next: NextType<StateType>) =>
      next({ ...state, sum: (state["sum"] ?? 0) + 5 });
    const actionDiv2 = (state: StateType, next: NextType<StateType>) =>
      next({ ...state, sum: (state["sum"] ?? 0) / 2 });

    const logs: Array<LogType<StateType>> = [];
    const logger = (entry: LogType<StateType>) => logs.push(entry);

    const result = await dispatcher(initialState, [actionAdd5, actionDiv2], [
      logger,
    ]);

    assert.assertEquals(result, { quarter: 1, year: 2018, sum: 3 });
    assert.assertEquals(logs, [
      {
        action: "actionAdd5",
        previousState: { quarter: 1, year: 2018, sum: 1 },
        newState: { quarter: 1, year: 2018, sum: 6 },
      },
      {
        action: "actionDiv2",
        previousState: { quarter: 1, year: 2018, sum: 6 },
        newState: { quarter: 1, year: 2018, sum: 3 },
      },
    ]);
  });

  bdd.it("promises", async () => {
    const initialState = 0;

    const delay = (num: number) =>
      new Promise<number>((resolve) => setTimeout(() => resolve(num), 200));
    const actionFirst = async (state: number, next: NextType<number>) =>
      next(state + await delay(5));
    const actionSecond = async (state: number, next: NextType<number>) =>
      next(state + await delay(3));

    const result = await dispatcher(initialState, [actionFirst, actionSecond]);

    assert.assertEquals(result, 8);
  });
});
