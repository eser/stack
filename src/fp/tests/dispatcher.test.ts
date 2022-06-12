import { asserts } from "./deps.ts";
import dispatcher, { LogType, NextType } from "../dispatcher.ts";

type StateType = Record<string, number>;

Deno.test("hex/fp/dispatcher:basic", async () => {
  const initialState = { quarter: 1, year: 2018, sum: 1 };

  const actionAdd5 = (state: StateType, next: NextType<StateType>) =>
    next({ ...state, sum: state.sum + 5 });
  const actionDiv2 = (state: StateType, next: NextType<StateType>) =>
    next({ ...state, sum: state.sum / 2 });

  const result = await dispatcher(initialState, [actionAdd5, actionDiv2]);

  asserts.assertEquals(result, { quarter: 1, year: 2018, sum: 3 });
});

Deno.test("hex/fp/dispatcher:with logger", async () => {
  const initialState = { quarter: 1, year: 2018, sum: 1 };

  const actionAdd5 = (state: StateType, next: NextType<StateType>) =>
    next({ ...state, sum: state.sum + 5 });
  const actionDiv2 = (state: StateType, next: NextType<StateType>) =>
    next({ ...state, sum: state.sum / 2 });

  const logs: LogType<StateType>[] = [];
  const logger = (entry: LogType<StateType>) => logs.push(entry);

  const result = await dispatcher(initialState, [actionAdd5, actionDiv2], [
    logger,
  ]);

  asserts.assertEquals(result, { quarter: 1, year: 2018, sum: 3 });
  asserts.assertEquals(logs, [
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

Deno.test("hex/fp/dispatcher:with promises", async () => {
  const initialState = 0;

  const delay = (num: number) =>
    new Promise<number>((resolve) => setTimeout(() => resolve(num), 200));
  const actionFirst = async (state: number, next: NextType<number>) =>
    next(state + await delay(5));
  const actionSecond = async (state: number, next: NextType<number>) =>
    next(state + await delay(3));

  const result = await dispatcher(initialState, [actionFirst, actionSecond]);

  asserts.assertEquals(result, 8);
});
