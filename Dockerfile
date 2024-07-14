FROM denoland/deno:distroless-1.42.1

# The port that the application listens to.
EXPOSE 8080

# Prefer not to run as root.
USER deno

WORKDIR /app

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
COPY deps.ts .
RUN deno cache deps.ts

# These steps will be re-run upon each file change in your working directory:
COPY ./pkg/ ./

# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache mod.ts

ENTRYPOINT ["deno", "task", "repl"]
