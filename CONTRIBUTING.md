# Contributing to quantum-api

Thanks for your interest! This document covers how to get a development
environment running, the coding standards we enforce, and the pull-request
workflow. If you are an AI assistant working on the codebase, also read
[CLAUDE.md](CLAUDE.md) — it covers architectural conventions that are not
repeated here.

## Ways to contribute

- **Core improvements** — hardening, observability, tests, documentation.
- **New endpoints / resources** — following the existing layered structure.
- **Deployment flexibility** — new deploy-time policy flags with safe defaults.
- **Bug reports and usability feedback** — open an issue with clear
  reproduction steps.

## Development environment

Requirements:

- Node.js (current LTS)
- PostgreSQL (a local instance or the provided `docker-compose.yaml`)
- A Keycloak / OIDC issuer for JWT validation (or the `portable-deployment`
  stack, which provides one)

Install dependencies and set up configuration:

```sh
npm install
cp .env.example .env      # fill in DB connection, Keycloak URL/realm, secrets
npm run migrate           # apply database migrations
```

Run the API for local development:

```sh
npx tsx ./src/server
```

Or bring up the API and a PostgreSQL instance with Docker:

```sh
docker compose up -d
```

## Coding rules

All of these are enforced by tooling — read `eslint.config.ts` and
`tsconfig.json` for the authoritative source.

### Formatting and linting — ESLint (+ Prettier)

```sh
npm run lint          # eslint
```

Prettier is wired in through ESLint (`eslint-plugin-prettier` /
`eslint-config-prettier`); keep formatting to the project config rather than
hand-tuning. If a rule genuinely does not apply to a
specific line, use a narrow `// eslint-disable-next-line <rule>` with a comment
explaining why, rather than disabling the rule globally.

### TypeScript

The project is TypeScript ESM (`"type": "module"`) and runs under
`tsx`/`ts-jest` with `.ts`-extension imports — there is no `tsc` emit build in
the normal flow. Add types to everything you touch; do not reach for `any` or
weaken existing types to silence the compiler — fix the type. (The tree carries
pre-existing type/lint debt; don't add to it in files you touch.)

### Tests — the gate

```sh
npm test              # jest --runInBand
```

The Jest suite is the enforced gate: keep it green.

Add tests under the existing Jest setup, mirroring the source layout. Mock
external services (PostgreSQL, Keycloak) by default; guard any tests that need
real services behind env vars.

## Database migrations

The schema is managed with `sequelize-cli`. Never edit an already-released
migration; add a new one:

```sh
npx sequelize-cli migration:generate --name <short-description> \
    --migrations-path migrations
npm run migrate
```

Migrations must be reversible (`up` and `down`) and must not depend on
application code. Any change to models under `src/models/` that alters the
schema needs a matching migration in the same PR.

## Layered architecture (keep the layers honest)

Requests flow **routes → middleware → controllers → services → repositories →
models**. Keep each layer in its lane:

- **Controllers** stay thin — parse/validate, call a service, shape the
  response. No business logic, no direct model access.
- **Services** hold business logic and orchestrate repositories inside
  transactions where needed.
- **Repositories** are the only place that touches Sequelize models.
- **Validation** lives in `zod` schemas under `src/schemas/` and is applied by
  validation middleware — don't hand-roll ad-hoc validation in controllers.

New deployment-time behaviour belongs behind a flag in `src/config/` with a
safe default that preserves historical behaviour, documented in
`.env.example`.

## Pull request workflow

1. **Branch** with a descriptive name (`feat/...`, `fix/...`).
2. **Keep the change focused.** One logical change per PR. Separate refactors
   from behaviour changes.
3. **Make the commit message explain the `why`.**
4. **Run the checks locally:**
   ```sh
   npm test        # must stay green
   npm run lint    # don't add new lint errors in files you touch
   ```
5. **Update documentation** in the same PR:
   - New env vars → update `.env.example`.
   - Schema changes → include the migration.
   - User-visible changes → update [README.md](README.md).
6. **Open the PR against `main`** with a description that covers what changed
   and why, any new configuration / migrations, and how you tested it.

## Security

Please **do not** open public issues for security reports. Email the
maintainers privately (see repository metadata) with a description and
reproduction. We'll acknowledge within a reasonable window and coordinate a
fix and disclosure.

## License

By contributing, you agree that your contributions will be licensed under the
[European Union Public Licence v. 1.2 (EUPL-1.2)](LICENSE) that covers the
project. See the Licensing section of [README.md](README.md) for what this
means in practice.
