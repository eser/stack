import { type Stack } from "./stack.ts";

/// Usage:
///
/// const stackBuilder = stackInit();
/// stackBuilder.addPlatform(WebPlatform, (options) => ({}));
/// stackBuilder.addPlatform(CliPlatform, (options) => ({}));
///
/// stackBuilder.addModule(RootModule, (options) => ({}));
///
/// const stack = await stackBuilder.build();
/// await stack.run();

interface StackBuilderItem {
  name: string;
  configureOptionsFn: () => void;
  initFn: () => Promise<void>;
}

interface StackBuilder {
  initializers: StackBuilderItem[];
}

const stackInit = (): StackBuilder => {
  return {
    initializers: [],
  };
};

const stackAddPlatform = (
  stackBuilder: StackBuilder,
  name: string,
  configureOptionsFn: () => void,
  initFn: () => Promise<void>,
): StackBuilder => {
  const initializer: StackBuilderItem = {
    name,
    configureOptionsFn: configureOptionsFn,
    initFn: initFn,
  };

  return {
    ...stackBuilder,
    initializers: [
      ...stackBuilder.initializers,
      initializer,
    ],
  };
};

const stackBuild = async (
  stackBuilder: StackBuilder,
): Promise<Stack> => {
  const stack: Stack = {
    platforms: {},
  };

  for (const initializer of stackBuilder.initializers) {
    await initializer.initFn();

    stack.platforms[initializer.name] = {};
  }

  return stack;
};

export { stackAddPlatform, stackBuild, stackInit };
