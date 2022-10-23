FROM hayd/alpine-deno:1.0.0

EXPOSE 8080

WORKDIR /app

USER deno

COPY ./src/deps.ts ./src/
RUN deno cache ./src/deps.ts

COPY ./src/ ./src/
COPY ./run ./
COPY ./.env ./
COPY ./.env.* ./
RUN deno cache ./src/app.ts

ENTRYPOINT []
CMD ["sh", "./run"]
