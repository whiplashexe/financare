# server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.13. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Testing

The tests run against a real PostgreSQL. A local one is much faster than a remote database (the full suite takes about 15 seconds locally, and many minutes against Neon).

The test database is a separate cluster that lives in `server/.pgtest` and listens on port `54329`. It does not touch any other PostgreSQL on the machine. It needs PostgreSQL 18 from Homebrew (`brew install postgresql@18`).

```bash
bun run db:test:start     # create (first time) and start the cluster and the financare_test database
bun run db:test:migrate   # apply the migrations to it (needed once, and after every new migration)
bun run test              # run the suite
bun run db:test:stop      # stop the cluster
bun run db:test:reset     # delete the cluster and start from scratch
```

`.env.test` must point at it:

```
DATABASE_URL="postgresql://postgres@localhost:54329/financare_test"
```

Always use `bun run test` instead of `bun test`: the script passes `--timeout 30000`, because `bun test` ignores the timeout set in `bunfig.toml`.

The tests create and delete their own users, so they never need an empty database. Never point `.env.test` at the development or production database.
