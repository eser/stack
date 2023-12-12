FROM denoland/deno:distroless-1.38.5

EXPOSE 8080

WORKDIR /app

USER deno

COPY ./ ./

ENTRYPOINT ["deno", "task", "repl"]
