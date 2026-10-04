# quantum-api

The platform backend of **Lagrange** — the management stack operating Italy's
first publicly-accessible quantum computer. quantum-api owns the
organizational and accounting model that sits behind the machine: users,
organizations, projects, budgets, reservations, and job billing. Developed in
the context of the **QTech Piemonte** strategic initiative.

<a href="https://linksfoundation.com"><img src="docs/assets/logo-links.png" alt="LINKS Foundation" height="60"></a>&nbsp;&nbsp;&nbsp;<a href="https://www.polito.it"><img src="docs/assets/logo-polito.png" alt="Politecnico di Torino" height="60"></a>&nbsp;&nbsp;&nbsp;<a href="https://www.inrim.it"><img src="docs/assets/logo-inrim.jpg" alt="INRIM" height="60"></a>

---

quantum-api is a REST backend that models *who may run what, and against which
budget*. It does not talk to the quantum hardware directly — the
[QC Gateway](https://github.com/LINKS-Foundation-CPE/QC-Gateway) sits in front
of the machine and calls into this API to authorize submissions and report
finished jobs for accounting. The [quantum-dashboard](#related-projects) is the
operator- and user-facing web UI on top of it.

> Status: Developed by LINKS Foundation Advanced Computing, Photonics and
> Electromagnetics research domain and used in production on IQM-based quantum
> hardware. Open-sourced so other projects can reuse and adapt the platform
> layer for their own quantum-computing services.

## What it manages

- **Identity & tenancy** — users, organizations, and projects, with
  organization- and project-scoped roles.
- **Budgets & billing** — per-project budgets denominated in QPU-time, debited
  by budget events as jobs complete, with a full ledger of accounting entries.
- **Reservations & slots** — calendar reservations against pre-allocated time
  slots, with configurable placement policies.
- **Job authorization & reporting** — endpoints the QC Gateway calls to
  authorize an incoming submission and to report a job's final state for
  billing attribution.
- **Project tags** — an admin-defined controlled vocabulary of project labels,
  assignable by a project's own administrators as well as by managers and
  platform admins.
- **Billing reports** — per-period aggregates of reserved time, executed job
  time, allocated slots and reservation utilization, grouped by project or by
  organization, computed here rather than by exporting the database.
- **Announcements & notifications** — operational messaging to users.

## Features

- **Layered architecture** — routes → middleware → controllers → services →
  repositories → Sequelize models, so request handling, business logic, and
  persistence stay separated.
- **Keycloak / OIDC authentication** — JWTs validated against a configurable
  issuer; a second backend token secures the gateway-to-API calls.
- **Role-based authorization** — organization- and project-level roles enforced
  by dedicated middleware.
- **PostgreSQL via Sequelize** — schema evolved through `sequelize-cli`
  migrations under `migrations/`.
- **react-admin compatible** — list endpoints emit `Content-Range` headers so
  the dashboard's data provider works out of the box.
- **Validated inputs** — request bodies and queries validated with `zod`.
- **OpenAPI / Swagger** — the full API surface is described in `api.yml` and
  served as an interactive Swagger UI at `/api-docs`.
- **Prometheus metrics** — `GET /metrics/jobs` exposes job counters by status
  plus per-organization, per-project, per-tag and per-user-domain aggregates,
  including executed QPU time. Every grouped series starts from its dimension,
  so a member with nothing reports `0` rather than disappearing from the scrape
  and leaving a gap in the panel.
- **Deployment policy flags** — behaviours are selectable at deploy time via
  environment variables whose **defaults preserve historical behaviour**, so
  the additions are safe to roll onto an existing deployment. See
  [.env.example](.env.example) for `SLOT_CONSTRAINED_RESERVATIONS`,
  `ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS`, `USERNAME_FORMAT`, and
  `PULSE_ACCESS_OIDC_ROLE`.

## Quick start

Requirements: Node.js (LTS), PostgreSQL, and a Keycloak/OIDC issuer for JWT
validation.

```sh
npm install
cp .env.example .env      # fill in DB connection, Keycloak URL/realm, secrets
npm run migrate           # apply database migrations
npx tsx ./src/server      # start the API
```

For a full, one-command local stack (this API together with the QC Gateway,
the dashboard, Keycloak, Postgres, Redis and MinIO on a bare IP with
self-signed TLS), see the **portable-deployment** project.

### Docker

```sh
docker compose up -d                          # API + PostgreSQL
# add the self-signed TLS overlay for native HTTPS on the published port:
docker compose -f docker-compose.yaml -f docker-compose.tls-dev.yaml up -d
```

## Configuration

All configuration is via environment variables; copy `.env.example` to `.env`
and fill in the required values (API port, Keycloak issuer/realm, the backend
secret, allowed CORS origin, and the database connection).

The deployment policy flags are documented inline in `.env.example`; their
defaults reproduce the historical behaviour. One is special:
`USERNAME_FORMAT` (`email` by default, or `any` for non-email identities such
as HPC cluster accounts) is **frozen at first deployment** — its value is
recorded in the database on first boot and a later boot with a conflicting
value refuses to start, so identities and billing attribution stay stable once
users exist.

## Database backup

The nightly dump runs everywhere, including on a development stack: it costs a
postgres container and some disk, needs nothing configured, and the thing most
likely to destroy a development volume is the person working on it.

The off-site copy is the half that needs somewhere to put the dumps, so it is
off by default. Enable it on a real deployment with `COMPOSE_PROFILES=backup`
in `.env`, plus `AWS_ENDPOINT` and the `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY` pair. Leaving it off means backups on disk, not no
backups.

| | |
|---|---|
| What | `pg_dump --format=custom` of the whole `quantum` database |
| When | 01:30 local, plus once on every container start |
| Where | the `db_dumps` volume, kept 7 days |
| Off-site | `volumes-backup` archives that volume to S3 at 03:00, kept 30 days |

`pg_dump` snapshots inside a single transaction, so the dump is consistent with
the API still serving. Nothing is stopped and nothing is given the Docker
socket. The dumper is the `postgres` image already in the stack — `pg_dump` must
be at least the server version, so the two tags move together.

Backing up the `postgres_data` volume directly is what this replaced: a
file-level copy of a running server's data directory is crash-consistent at
best, and it is not a copy you want to discover the limits of during an
incident.

A dump is written as `.part` and renamed only when `pg_dump` exits cleanly, so a
truncated file is never mistaken for a good backup. Each success touches
`.last-success`, and the container's healthcheck fails once that is more than 26
hours old — a backup job that has been failing quietly for three weeks is the
usual way backups fail.

### Restoring

```bash
# newest dump, into a fresh database alongside the live one
docker compose exec quantum-api-db psql -U quantumapi -d postgres -c 'CREATE DATABASE quantum_restore;'
docker compose run --rm --entrypoint sh quantum-api-db-dump -c \
  'PGPASSWORD=$POSTGRES_PASSWORD pg_restore -h quantum-api-db -U quantumapi \
     -d quantum_restore "$(ls -t /dumps/quantum-*.dump | head -1)"'
```

Restoring *over* the live database means stopping the API first — it holds
connections, and a half-restored schema is worse than a stopped service:

```bash
docker compose stop quantum-api
docker compose exec quantum-api-db psql -U quantumapi -d postgres \
  -c 'DROP DATABASE quantum;' -c 'CREATE DATABASE quantum;'
docker compose run --rm --entrypoint sh quantum-api-db-dump -c \
  'PGPASSWORD=$POSTGRES_PASSWORD pg_restore -h quantum-api-db -U quantumapi \
     -d quantum "$(ls -t /dumps/quantum-*.dump | head -1)"'
docker compose start quantum-api
```

`pg_restore --list <file>` reads an archive's table of contents without
restoring anything, which is the cheap way to check a dump is not truncated.
Migrations are one-way, so take a dump before running one against data you care
about — `docker compose restart quantum-api-db-dump` produces one immediately.

## Project layout

```
src/
├── app.ts               # Express application wiring
├── server.ts            # process entrypoint
├── config/              # database, logger, constants, error types, policy
├── routes/              # HTTP route definitions
├── middleware/          # auth (JWT/Keycloak), RBAC, validation, query parsing
├── controllers/         # request handlers (thin)
├── services/            # business logic
├── repositories/        # data access over Sequelize models
├── models/              # Sequelize model definitions
├── schemas/             # zod validation schemas
├── mappers/             # DTO/entity mapping
├── types/               # shared TypeScript types
└── utils/               # generic helpers
migrations/              # sequelize-cli database migrations
```

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md) — development setup, coding style,
  linting/formatting, migrations, and the contribution workflow.
- [CLAUDE.md](CLAUDE.md) — orientation for AI assistants working on this
  codebase (also a useful cheat sheet for new human contributors).

## Related projects

- **[QC Gateway](https://github.com/LINKS-Foundation-CPE/QC-Gateway)** — the
  authenticating, auditing reverse proxy in front of the quantum machine; it
  calls this API to authorize and report jobs.
- **quantum-dashboard** — the react-admin web UI for operators and users.
- **portable-deployment** — one-command deployment of the whole stack for
  development and integration experiments.

## Authors

Lagrange-API was written mostly by **Fabrizio Bertone**
([@fblinks](https://github.com/fblinks)), with **Paolo Viviani**
([@paoloviviani](https://github.com/paoloviviani)), at LINKS Foundation.
Development before the first public release happened in a private repository,
so the public history starts there.

## Citation

If you use Lagrange in your research, please cite:

```bibtex
@misc{viviani2026lagrangeoperatingitalyspubliclyaccessible,
      title={Lagrange: Operating Italy's First Publicly-Accessible Quantum Computer for Research and Education}, 
      author={Paolo Viviani and Fabrizio Bertone and Giacomo Vitali and Emanuele Dri and Federico Stirano and Giuseppe Caragnano and Francesco Lubrano and Antonino Nespola and Olivier Terzo and Matteo Cocuzza and Bartolomeo Montrucchio and Giovanna Turvani and Gianluca Bertaina and Marco Coisson and Davide Calonico and Fabrizio Pirri and Pietro Asinari},
      year={2026},
      eprint={2604.21695},
      archivePrefix={arXiv},
      primaryClass={quant-ph},
      url={https://arxiv.org/abs/2604.21695}, 
}
```

## Licensing

quantum-api is licensed under the **European Union Public Licence v. 1.2
(EUPL-1.2)** — see [LICENSE](LICENSE).

EUPL-1.2 is an OSI- and FSF-approved copyleft licence maintained by the
European Commission. It is compatible with GPL (v2 and v3), LGPL, AGPL, MPL,
CeCILL, and several other major licences through the EUPL compatibility list,
so code from those licences can be combined with quantum-api without licence
conflicts.
