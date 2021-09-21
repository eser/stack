// deno-lint-ignore ban-types
function decorate(target: Function, decorator: Function) {
  // deno-lint-ignore no-explicit-any
  return function func(...args: Array<any>): any {
    return decorator(...args, target);
  };
}

export { decorate as default };
