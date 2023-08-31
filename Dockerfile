FROM denoland/deno:debian-1.36.3

EXPOSE 8080

WORKDIR /app

USER deno

COPY ./src/ ./src/
COPY ./etc/ ./etc/
COPY ./.env ./
COPY ./.env.* ./
RUN deno cache ./src/mod.ts

ENTRYPOINT []
CMD ["deno", "task", "start"]
