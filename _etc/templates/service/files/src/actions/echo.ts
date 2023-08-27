import { type Registry } from "$app/types.ts";

export interface EchoActionProps {
  registry: Registry;
  slug: string;
}

export const echoAction = (props: EchoActionProps) => {
  const { test } = props.registry.getMany("test");

  return {
    message: `Hello ${props.slug}! Testing ${test}...`,
    timestamp: new Date().toLocaleDateString(),
  };
};

export { echoAction as default };
