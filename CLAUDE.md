# CLAUDE.md

Orientation for AI assistants (and new human contributors) working on
**quantum-api**. Read this before making changes.

## What this project is

The platform backend of the **Lagrange** quantum-computing management stack.
It models the organizational and accounting world behind the machine —
users, organizations, projects, budgets, reservations, and job billing — and
exposes a REST API consumed by the [quantum-dashboard](README.md) (web UI) and
by the QC Gateway (which calls in to authorize submissions and report finished
jobs).

quantum-api does **not** talk to quantum hardware. If you find yourself adding
vendor- or device-specific logic here, it almost certainly belongs in the QC
Gateway instead.

- User-facing overview: [README.md](README.md).
- Development workflow: [CONTRIBUTING.md](CONTRIBUTING.md).

## Stack

Node.js + TypeScript (ESM), Express, Sequelize over PostgreSQL, `zod` for
validation, Jest for tests, `sequelize-cli` for migrations. ESLint + Prettier
for style.

## Architectural rules (non-negotiable)

1. **Respect the layers.** Requests flow routes → middleware → controllers →
   services → repositories → models. Controllers stay thin; business logic
   lives in services; only repositories touch Sequelize models. Don't let a
   controller query a model directly, and don't put business rules in a
   repository.

2. **Validation is declarative.** Request bodies and queries are validated by
   `zod` schemas in `src/schemas/`, applied via validation middleware. Don't
   hand-roll validation inside controllers.

3. **Schema changes go through migrations.** Any change to a model under
   `src/models/` that alters the database schema needs a matching
   `sequelize-cli` migration under `migrations/` in the same change. Never edit
   an already-released migration.

4. **Money is QPU-time.** Budgets and billing are denominated in QPU-time and
   moved only through budget events, which form an auditable ledger. Don't
   mutate a balance without recording the event that caused it.

5. **New deploy-time behaviour goes behind a flag with a compatible default.**
   Configurable behaviour lives in `src/config/` (`policy.ts`,
   `usernamePolicy.ts`) with a default that **preserves historical Lagrange
   behaviour**, and is documented in `.env.example` — the governing constraint
   is that any addition can be rolled onto the live deployment without changing
   its behaviour (schema migrations aside). Current flags:
   `SLOT_CONSTRAINED_RESERVATIONS` (default true), `ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS`
   (default true), `USERNAME_FORMAT` (default `email`, frozen at first
   deployment in `system_configs`), and `PULSE_ACCESS_OIDC_ROLE` (default
   `pulla_user` — the realm role that seeds `users.pulla_user` at first registration).

## Where things live

```
src/
├── app.ts               # Express application wiring
├── server.ts            # process entrypoint
├── config/              # database, logger, constants, error types, policy flags
├── routes/              # HTTP route definitions
├── middleware/          # authenticateJWT, RBAC, validate, parseQuery, ...
├── controllers/         # thin request handlers
├── services/            # business logic
├── repositories/        # data access over Sequelize models
├── models/              # Sequelize model definitions
├── schemas/             # zod validation schemas
├── mappers/             # DTO/entity mapping
├── types/               # shared TypeScript types
└── utils/               # generic helpers
migrations/              # sequelize-cli database migrations
backup/                  # nightly pg_dump sidecar (compose profile `backup`)
```

## When making changes

- **Adding a resource/endpoint** — add the route, a thin controller, a service
  for the logic, a repository for persistence, a `zod` schema for input, and a
  migration if the schema changes. Keep list endpoints react-admin compatible
  (emit `Content-Range`).
- **Touching auth** — JWT validation and RBAC middleware are load-bearing for
  the gateway integration. Changing them affects who can authorize/report jobs;
  call it out explicitly in the PR.
- **Touching configuration** — add the env var to `.env.example` with a safe
  default that preserves historical behaviour.
- **Touching a migration** — migrations are one-way; there is no schema
  downgrade. The `backup` profile dumps nightly and on start, so
  `docker compose restart quantum-api-db-dump` takes a snapshot before you run
  one against data that matters. Restore procedure is in `README.md`.

## Development workflow

See [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```sh
npm install
cp .env.example .env
npm run migrate
npm test            # Jest suite — the enforced gate; keep it green
npm run lint        # ESLint/Prettier — run before a PR
```

The app runs under `tsx`/`ts-jest` (TypeScript ESM with `.ts`-extension
imports); there is no `tsc` emit build in the normal flow. **`npm test` is the
gate that must stay green.** `npm run lint` and strict type-checking currently
carry pre-existing debt across the tree — don't add to it in files you touch,
and don't treat a red tree elsewhere as license to skip local checks.

## Code style

- **ESLint + Prettier** — don't fight the config; narrow
  `// eslint-disable-next-line <rule>` with a reason if a rule is genuinely
  wrong for a line.
- **Types everywhere** — no `any` to silence the compiler; fix the type.
- **Logging over `console`** — use the project logger (`src/config/logger`).
- **Comments explain `why`, not `what`.**

## What NOT to do

- Don't bypass the layers (controller → model, business logic in a repository).
- Don't edit released migrations; add a new one.
- Don't add dependencies casually — this runs in production. Justify each
  addition in the PR.
- Don't commit `.env`, credentials, or local database data. They're
  gitignored; keep it that way.
- Don't add device/vendor-specific logic — that belongs in the QC Gateway.

## Cutting a release

The project uses **CalVer** `YYYY.MM.PATCH`; rules are at the top of
[CHANGELOG.md](CHANGELOG.md). To cut one: move `## [Unreleased]` entries into a
new dated section, flag operator-action items with **Breaking:**, add the link
reference at the bottom, bump the version in `package.json`, commit
(`chore: release <version>`), then tag (`git tag -a <version>`) and push the
tag. Tags are bare (no `v` prefix).

## Repository layout — private + public

Development happens on a **private GitLab repo**; a public open-source mirror
on **GitHub**, `Lagrange-API`, is planned (repository not yet created):

| Remote | URL | Purpose |
|--------|-----|---------|
| `origin` | `gitlab.linksfoundation.com:links-iqm-spark/machine-management/quantum-api.git` | Private development (default push target) |
| `github` | `github.com:LINKS-Foundation-CPE/Lagrange-API.git` (to be created) | Public open-source mirror |

### Branch mapping

| Branch | Lives on | Pushed to |
|--------|----------|-----------|
| `main` | GitLab `origin` | `origin main` only |
| `public` | Both remotes | `origin public` + `github main` (once created) |

`public` is an **orphan branch** — its history starts from a clean "Initial
public release" squash commit and never includes the pre-release private
history. It is fast-forwarded from `main` one commit at a time via
`git cherry-pick`.

### What never goes on `public`

These paths are deployment machinery for *our* installation. They belong on
`main` and must never be cherry-picked to `public`:

| Path | Why |
|------|-----|
| `.gitlab-ci.yml` | The deploy pipeline: our SSH targets, deploy directory and `DEV_*`/`PROD_*` CI variable names. Useless publicly and a description of our infrastructure. |
| `prod_db_mirror.sh` | Operator tool that pulls a copy of the production database. Names the production host. |

Everything else is published, and is written to be deployment-neutral: no
committed host names, IP addresses or credentials, and every behaviour that
differs between deployments is an environment variable documented in
`.env.example`. Keep it that way — if you find yourself hardcoding one, make it
a variable instead.

If a commit touches both publishable code and an excluded path, cherry-pick it
with `-n`, drop the excluded path, and commit on `public` with the same message.

### Publishing a commit to GitHub

After merging or committing to `main` on GitLab:

```bash
git checkout public
git cherry-pick <commit-sha>          # repeat for each commit to publish
git push origin public                # update GitLab mirror of public
git push github public:main           # update GitHub main (once the repo exists)
git checkout main
```

Review each cherry-pick before pushing — the `public` branch is the gate that
prevents internal details from leaking to GitHub. Never push `main` directly to
GitHub or rebase `public` onto `main` (that would carry the full private
history).

## Working on this repository on its own

Clone it anywhere and it is workable: everything needed to build, test and change
it is in here. Nothing in this file depends on another repository being at hand,
or on any private document.

What it talks to, and where each contract is written down:

| Counterpart | Interface | Where the contract is |
|---|---|---|
| QC Gateway (`nginx-reverse-proxy`) | `POST /jobAuthorizer`, `POST`/`PUT /jobReport`, `GET /userRoles/{username}` — the machine endpoints, called by the proxy rather than by humans | `api.yml`, which documents them alongside `/api/*` including their authentication gaps |
| Portal UI (`quantum-dashboard`) | `/api/*`, react-admin conventions (`Content-Range` on lists, `filter`/`sort`/`range` query params) | `api.yml` |
| Identity provider (Keycloak) | OIDC token in, platform token out, at `POST /auth/token`; realm roles mapped to platform roles | `src/routes/token.ts`, and `PULSE_ACCESS_OIDC_ROLE` in `.env.example` |

The machine endpoints are the ones to be careful with: they drive billing, and
`/jobReport` and `/userRoles` carry no credential at all. `api.yml` says so
explicitly — do not treat that as an oversight to tidy away.

Every repository in the stack carries a `CLAUDE.md` in this same shape, so the
same is true read from the other side. If you find yourself needing a fact that
is not in one of them, that is a gap worth fixing in the repository that owns the
fact — not a reason to go looking for a central document.
