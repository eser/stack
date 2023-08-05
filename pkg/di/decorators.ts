// import "https://esm.sh/@abraham/reflection?target=deno";
// import { type Container, registry } from "./registry.ts";

// const injectableDecoratorTokenKey = Symbol.for("hex.di.injectable.token");
// const injectableDecoratorContainerKey = Symbol.for(
//   "hex.di.injectable.container",
// );

// export const injectable = (
//   token?: string,
//   targetContainer?: Container,
// ): ClassDecorator => {
//   // deno-lint-ignore ban-types
//   return (target: Function) => {
//     Reflect.defineMetadata(
//       injectableDecoratorTokenKey,
//       token ?? target.name,
//       target,
//     );
//     Reflect.defineMetadata(
//       injectableDecoratorContainerKey,
//       targetContainer,
//       target,
//     );

//     (targetContainer ?? registry).setValue(token ?? target.name, target);
//   };
// };

// export const inject = (
//   token: string,
//   targetContainer?: Container,
// ): PropertyDecorator => {
//   // deno-lint-ignore ban-types
//   return (target: Object, propertyKey: string | symbol): void => {
//     const value = (targetContainer ?? registry).get(token);

//     Object.defineProperty(target, propertyKey, {
//       configurable: false,
//       get: () => new value(),
//     });
//   };
// };

// @injectable()
// class A {
//   text: string;

//   constructor() {
//     this.text = "dene-type";
//   }
// }

// // console.log(getInjectableMetadata(A));

// class B {
//   @inject("A")
//   public a2!: A;

//   deneme() {
//     // this.a2 = new A();
//     console.log("output", this.a2);
//   }
// }

// const b = new B();
// console.log(b.deneme());
