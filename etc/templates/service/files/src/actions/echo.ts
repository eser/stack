import { type Registry } from "@app/types.ts";

interface EchoActionProps {
  registry: Registry;
  slug: string;
}

const echoAction = (props: EchoActionProps) => {
  const { test } = props.registry.getMany("test");

  return {
    message: `Hello ${props.slug}! Testing ${test}...`,
    timestamp: new Date().toLocaleDateString(),
  };
};

export { echoAction, echoAction as default, type EchoActionProps };
