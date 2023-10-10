import { type AppProps } from "../../../server.ts";

export default function App({ Component }: AppProps) {
  return (
    <div className="app">
      <Component />
    </div>
  );
}
