// import { assert, bdd, mock } from "../deps.ts";
// import { Ok } from "./results.ts";
// import { fnExec, fnIter } from "./execute.ts";
// import { composer } from "./composer.ts";

// bdd.describe("cool/functions/composer", () => {
//   bdd.it("simple middleware", async () => {
//     const spyInitFn = mock.spy();
//     const spyMwFn = mock.spy();
//     const spyExecFn = mock.spy();

//     // deno-lint-ignore no-explicit-any
//     const initFn = function* (ctx: any) {
//       spyInitFn();

//       ctx.value += 1;

//       yield* ctx.next?.();
//     };

//     // deno-lint-ignore no-explicit-any
//     const mwFn = function* (ctx: any) {
//       spyMwFn();

//       ctx.value += 2;

//       yield* ctx.next?.();
//     };

//     // deno-lint-ignore no-explicit-any
//     const execFn = function* (ctx: any) {
//       spyExecFn();

//       ctx.value += 4;

//       yield* ctx.next?.();
//     };

//     // deno-lint-ignore no-explicit-any
//     const fn = composer<any>(initFn, mwFn, execFn);

//     const result = await fnIter(fn, { value: 0 });
//     for await (const x of result) {
//       console.log(x);
//       // do nothing
//     }

//     // mock.assertSpyCalls(spyInitFn, 1);
//     // mock.assertSpyCalls(spyMwFn, 1);
//     // mock.assertSpyCalls(spyExecFn, 1);
//     // assert.assertEquals(result.payload.value, 7);
//   });
// });
