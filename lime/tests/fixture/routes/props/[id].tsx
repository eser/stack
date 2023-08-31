import { type PageProps } from "$cool/lime/server.ts";

export default function Home(props: PageProps) {
  return <div>{JSON.stringify(props)}</div>;
}
