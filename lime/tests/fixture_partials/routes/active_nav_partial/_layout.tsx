import { LayoutProps } from "../../../../server.ts";

export default function Layout({ Component }: LayoutProps) {
  return (
    <div f-client-nav>
      <Component />
    </div>
  );
}
