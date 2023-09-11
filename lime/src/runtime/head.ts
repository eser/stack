import { type ComponentChildren, view } from "./drivers/view.tsx";

export interface HeadProps {
  children: ComponentChildren;
}

export const HEAD_CONTEXT = view.adapter.createContext<ComponentChildren[]>([]);

export function Head(props: HeadProps) {
  let context: ComponentChildren[];

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