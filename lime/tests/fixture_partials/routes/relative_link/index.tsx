import { Partial } from "$cool/lime/runtime.ts";
import { defineRoute } from "$cool/lime/server.ts";
import { Fader } from "../../islands/Fader.tsx";

export default defineRoute((req) => {
  const url = new URL(req.url);

  return (
    <div f-client-nav>
      <Partial name="body">
        <Fader>
          <p
            className={url.searchParams.has("refresh")
              ? "status-refreshed"
              : "status-initial"}
          >
            {url.searchParams.has("refresh")
              ? "Refreshed content"
              : "Initial content"}
          </p>
        </Fader>
      </Partial>
      <p>
        <button f-partial="?refresh">
          refresh
        </button>
      </p>
    </div>
  );
});
