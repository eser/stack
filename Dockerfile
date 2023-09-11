FROM denoland/deno:debian-1.36.4

EXPOSE 8080

WORKDIR /app

USER deno

COPY ./ ./

ENTRYPOINT []
CMD ["deno", "task", "repl"]
