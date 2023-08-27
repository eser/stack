FROM denoland/deno:debian-1.27.0

EXPOSE 8080

WORKDIR /app

USER deno

COPY ./src/deps.ts ./src/
COPY ./deno.json ./
RUN deno cache --unstable ./src/deps.ts

COPY ./src/ ./src/
COPY ./etc/ ./etc/
COPY ./.env ./
COPY ./.env.* ./
RUN deno cache --unstable ./src/main.ts

ENTRYPOINT []
CMD ["deno", "task", "start"]
