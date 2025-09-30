FROM denoland/deno:2.5.2

# Prefer not to run as root.
USER deno

# Set working directory
WORKDIR /srv/playground
ENV DENO_DIR=.deno_cache

RUN mkdir -p .deno_cache

# Install dependencies first to improve caching
COPY --chown=deno:deno . ./
RUN deno install --allow-scripts --reload --entrypoint ./pkg/mod.ts

CMD ["task", "repl"]
