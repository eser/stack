// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type ComponentChildren, view } from "./drivers/view.tsx";

export interface HeadProps {
  children: ComponentChildren;
}

export const HEAD_CONTEXT = view.adapter.createContext<
  Array<ComponentChildren>
>([]);

export function Head(props: HeadProps) {
  let context: Array<ComponentChildren>;

  try {
    context = view.adapter.useContext(HEAD_CONTEXT);
  } catch (err) {
    throw new Error(
      "<Head> component is not supported in the browser, or during suspense renders.",
      { cause: err },
    );
  }

  context.push(props.children);
  return null;
}
