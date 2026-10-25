# Builds BRLorena/finance_app at a given git ref and runs it in production
# mode (`next start`), the same build Vercel serves, minus the CDN.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG APP_REPO=https://github.com/BRLorena/finance_app.git
ARG APP_REF=master
WORKDIR /app
RUN git init -q . \
  && git fetch -q --depth 1 "$APP_REPO" "$APP_REF" \
  && git checkout -q FETCH_HEAD \
  && git log -1 --format='%H %s' > /app-commit.txt

RUN npm ci --no-audit --no-fund

# Prisma needs a URL at build time; nothing connects to it
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    POSTGRES_URL=postgresql://build:build@localhost:5432/build \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# Create the schema on the empty database, then serve
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
