import { type ServiceScope } from "$cool/di/mod.ts";

export interface EchoActionProps {
  services: ServiceScope;
  slug: string;
}

export const echoAction = (props: EchoActionProps) => {
  const test = props.services.get("test");

  return {
    message: `Hello ${props.slug}! Testing ${test}...`,
    timestamp: new Date().toLocaleDateString(),
  };
};

export { echoAction as default };
