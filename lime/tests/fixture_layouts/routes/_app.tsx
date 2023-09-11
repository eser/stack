import { type AppProps } from "$cool/lime/server.ts";

export default function App({ Component }: AppProps) {
  return (
    <div className="app">
      <Component />
    </div>
  );
}
