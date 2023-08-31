import { type ErrorPageProps } from "$cool/lime/server.ts";

export default function Error500Page({ error }: ErrorPageProps) {
  return <p>500 internal error: {(error as Error).message}</p>;
}
