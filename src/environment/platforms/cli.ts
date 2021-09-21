import type Formatter from "../../formatters/formatter.ts";
import type PlatformContext from "../platform-context.ts";
import PlatformType from "../platform-type.ts";

function createContext(): PlatformContext {
  function getAvailableFormatters(): Formatter[] {
    return [];
  }

  function getAllVariables(): Record<string, unknown | null> {
    return {};
  }

  function getVariable(name: string): unknown | null | undefined {
    return null;
  }

  return {
    type: PlatformType.Runtime,

    getAvailableFormatters: getAvailableFormatters,
    getAllVariables: getAllVariables,
    getVariable: getVariable,

    // eventHandler:
    //   | ((event: Event, ...args: unknown[]) => void | Promise<void>)
    //   | null;
    eventHandler: null,

    // vars: Record<string, () => unknown | unknown>;
    vars: {},
  };
}

const cli = {
  createContext,
};

export { cli as default };
