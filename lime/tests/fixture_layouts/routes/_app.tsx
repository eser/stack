import { AppProps } from "$cool/lime/server.ts";

export default function App({ Component, state }: AppProps) {
  return (
    <div class="app">
      <Component />
    </div>
  );
}
