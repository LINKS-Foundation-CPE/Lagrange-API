# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses **CalVer** in the form `YYYY.MM.PATCH`:

- `YYYY.MM` is bumped when a release is cut in that year and month. There is
  no obligation to release every month; the date simply records when the
  release happened.
- `.PATCH` is bumped for fix-only follow-up releases within the same month,
  starting at `.0`.
- Pre-release labels (e.g. `-rc1`, `-pre-<name>`) may be appended when
  appropriate.

Entries marked **Breaking:** require operator action on upgrade — typically a
change to `.env`, `docker-compose.yaml`, or a new database migration.

## [Unreleased]

## [2026.10.0] — 2026-10-02

### Fixed
- **The portal comes back by itself after the host is powered off.**
  `quantum-api-db` had no restart policy, so after a power-off Docker left it
  stopped while `quantum-api` (`restart: always`) came up, could not reach it,
  and restarted forever — an empty dashboard until someone ran
  `docker compose up`. The database now restarts with the host, has a
  `pg_isready` healthcheck, and the API, the migration job and the dump
  sidecar wait for it to be healthy. Reproduced and verified with a simulated
  power cycle of the Docker daemon. **Operator action:** none beyond the
  next deploy, which recreates the database container with the new policy.
- **`/jobAuthorizer` reads the body whatever content-type it claims.** The
  default parser accepts only `application/json` and silently hands the route an
  empty body for anything else — which on this endpoint is not a parse failure
  but a *widening*: no `job_type` means no pulse check, no `project_name` means
  no membership check, and the job is authorized against the user's default
  project. That is how a sweep from a user without Pulse access came back 200.

  The QC Gateway was mislabelling the call (fixed there too — sweeps arrive as
  byte blobs and it copied the blob's content-type onto its own JSON request),
  but a machine endpoint that quietly authorizes more when it cannot read the
  request is wrong on its own terms. It now parses regardless and answers 400 on
  a body that genuinely is not JSON. There is a regression test posting a sweep
  as `application/octet-stream`.

- **An admin can now actually revoke Pulse access.** The realm role was mirrored
  onto `users.pulla_user` at *every* login, so turning the *Pulse access* toggle
  off for a user whose Keycloak account still carries the role lasted until that
  user's next sign-in — the dashboard reported the change, the flag came back,
  and the user kept submitting sweeps. The mirror is now a seed: the realm role
  sets the flag when a login registers a user row that did not exist yet, and
  after that the platform is authoritative.

  `syncPulseAccessFromOidcRoles(user, roles)` is replaced by the pure
  `hasPulseAccessOidcRole(roles)`; nothing on the login path writes the flag any
  more. `PULSE_ACCESS_OIDC_ROLE` is unchanged and still names the realm role.

  Existing users are unaffected — anyone the mirror had already granted keeps the
  flag. What changes is a user who gains the realm role *after* their first
  login: they no longer pick Pulse access up automatically, an admin grants it in
  the dashboard. That is the same trade as revocation working at all, and it
  matches where the decision now lives — `/jobAuthorizer` reads this flag, so the
  platform has to own it.

- **Only platform admins can set `pulla_user`.** The dashboard has always hidden
  the *Pulse access* toggle from organization managers, but the backend accepted
  the field from them: `PUT`/`POST /api/users` are open to
  `admin, organization-manager` and the schema took `pulla_user`, so a manager
  could grant pulse access with a hand-made request. The UI hid a control the API
  did not protect.

  It is dropped from a non-admin's payload rather than refused, because the
  dashboard's form submits the record it loaded — refusing would break an
  organization manager saving an unrelated change to a field they never saw.
  Ignoring it cannot escalate anything.

  This mattered less while the gateway decided pulse access from a realm role in
  the token. It matters now that `/jobAuthorizer` decides it from this flag:
  whoever can set it can grant machine capability.

### Added
- **Recurring slots and reservations.** `POST /api/slots/series` and
  `POST /api/reservations/series` take a weekly recurrence — weekdays, a
  wall-clock start and end time, a date range, a time zone — and create one
  ordinary row per occurrence under a shared `series_id`. Wall-clock, not a UTC
  offset: a 09:00 series stays 09:00 in Turin across the clock changes. At most
  366 occurrences, so a mistyped year is an error rather than ten thousand rows.

  Every rule a single create enforces is enforced per occurrence. For
  reservations the server also resolves each occurrence's slot — the slot of
  the project's organization, or its reference organization, that covers it —
  so the caller does not pick one per day, and checks the **total** cost
  against the budget. That total is debited once and recorded as one budget
  event per reservation, so the ledger matches single bookings line for line.

  Creating is preview-then-choose. `dry_run` returns every occurrence with the
  reason any of them cannot be created, and the cost, writing nothing. A real
  request creates the whole series in one transaction, or — when some
  occurrences conflict — refuses with the same report (409) unless
  `skip_conflicts` says to create the rest. A project that cannot pay for the
  creatable occurrences is refused even when skipping. Nothing is ever
  half-created: a failure part way rolls back every row and the budget.

  `DELETE /api/slots/series/{id}` and `DELETE /api/reservations/series/{id}`
  delete every **future** occurrence, keeping past ones as history. Reservation
  deletes refund by the rule single deletes use — in full more than 24 hours
  ahead, a quarter closer than that, now shared as `refundFor` — with one budget
  event each and one notification per owner. A slot series holding any
  reservation is refused whole, as a single slot is.

  Migration `20260927120000` adds a nullable, indexed `series_id` to `slots`
  and `reservations`; existing rows stay null. No new configuration.

- **A nightly logical backup of the portal database, on by default.** A
  `quantum-api-db-dump` sidecar runs `pg_dump --format=custom` into a new
  `db_dumps` volume at 01:30 and once on every container start, keeping 7 days;
  `volumes-backup` now ships *that* off-site rather than the live `postgres_data`
  directory, because a file-level copy of a running server's data directory is
  crash-consistent at best.

  The dump runs everywhere, including on a development stack: it costs a
  postgres container and some disk, needs nothing configured, and the thing
  most likely to destroy a development volume is the person working on it. Only
  the off-site copy stays behind `COMPOSE_PROFILES=backup`, since that is the
  half that needs an S3 endpoint and credentials — so leaving the profile off
  means backups on disk, not no backups.

  A dump is written as `.part` and renamed only when `pg_dump` exits cleanly, so
  a truncated file is never mistaken for a good one, and each success touches
  `.last-success`; the container's healthcheck fails once that is more than 26
  hours old, because a backup job failing quietly for weeks is the usual way
  backups fail. Restore procedure — into a fresh database or over the live one
  — is in `README.md`.

- **`GET /api/projects` accepts `q`** — a case-insensitive **substring** match on
  the project name, the same free-text filter the user list already takes. Added
  so the dashboard's default-project picker can be searched: without it the
  picker is a select over one page of projects and anything outside it cannot be
  chosen.

  Substring rather than prefix is deliberate. Project names follow a convention
  where the distinguishing part is rarely at the front, so an anchored match
  would find nothing anyone is looking for — there is a test asserting exactly
  that.
- **Pulse (sweep) access is enforced in `/jobAuthorizer`**, not only at the
  gateway. The gateway decides it from a realm role in the submitted token,
  which leaves out principals whose tokens carry no roles at all, and leaves an
  administrator unable to revoke access without editing the identity provider.
  `users.pulla_user` is the platform's own record of the grant — mirrored from
  the identity provider at login, and settable by an administrator — so it is
  the thing to ask.

  The gateway now sends `job_type` with the authorization call; when it names a
  privileged path (`sweep` for IQM) and the caller lacks the flag, the answer is
  `403` before any project is resolved, since pulse access is a property of the
  user rather than of the project. **A request carrying no `job_type` is treated
  as the ordinary circuit path**, which is exactly what a gateway older than the
  field sends — so the two sides can be deployed in either order without a
  window where sweeps are refused.

### Added
- **`budget_events.user_id`** — who a transaction is attributable to: the
  submitter for a job charge, the acting user for a reservation charge or
  refund. The ledger recorded what moved and why, in prose, but never who, so
  the person behind a charge was a lookup away and the dashboard could not show
  them at all.

  Nullable, because plenty of transactions have no user behind them — an
  organization's vault being funded, a project created with a budget — and
  `ON DELETE SET NULL`, because a ledger entry outlives the account that caused
  it: deleting a user must neither delete the record of what they spent nor be
  blocked by it.

  **The migration backfills the job charges already on record.** Both
  descriptions the biller writes begin `Job <jobid> (<row id>)`, so the row id
  is lifted out and joined to `jobs`; a row that does not match is left null
  rather than guessed at. So this is not a column that only starts working from
  today.

  `GET /api/projects/{id}/transactions` additionally embeds `user` as
  `{ id, email }`. Embedded rather than left as a reference for the client to
  resolve: the ledger is one line per transaction and would otherwise cost a
  user lookup per distinct id, and a project admin may read that endpoint
  without necessarily being able to read `/api/users`.

### Added
- **Six new series on `GET /metrics/jobs`**, alongside the job and
  per-organization counts already scraped:
  - `users_total`, and `users_by_email_domain{domain}` grouping users by the
    domain of their address. A domain label rather than one hardcoded
    institution: "how many students" is then
    `users_by_email_domain{domain="studenti.polito.it"}`, a selector on a
    deployment-neutral series, and every other domain comes free. Addresses are
    institutional, so the label stays low-cardinality. An address with no `@`
    counts in `users_total` and in no domain, which is the only way the two
    disagree.
  - `projects_by_tag{tag_id,tag}`, from `tags` so a tag nobody uses reports 0.
    A project may carry several tags, so unlike every other series here these
    overlap by construction and do not sum to the number of projects.
  - `jobs_by_project{project_id,project,organization_id,organization}`, the
    per-organization count a level lower, from `projects` so an idle project
    reports 0. The organization rides along as a label so a query can group by
    it without joining, and is reached through the project — the same
    attribution rule as the per-organization series.
  - `qpu_seconds_by_project{...}` and `qpu_seconds_by_organization{...}`:
    executed QPU time, summed over `execution_end - execution_start`. Seconds
    rather than hours, because the unit belongs in the metric name and the
    conversion belongs in whatever query wants hours.

  The endpoint got **cheaper** despite returning more. Both job levels now come
  from one query instead of one per level: the aggregate over `jobs` runs
  before the join, so the rows are grouped down to one per project and only
  those meet `projects`, and the elapsed time is summed as an interval and
  converted to seconds once rather than per row. `GROUPING SETS` yields the
  organization and project levels from the same intermediate. Measured against
  800k jobs — production is around 773k — a full scrape costs **~130 ms**,
  against ~350 ms for the smaller set of series it replaces and ~660 ms for the
  same series written the obvious way. The organization numbers are unchanged.

  **These QPU figures are not the billing reports' usage number.** A report
  excludes jobs that ran inside a reservation, since that time is already
  billed as reserved hours and counting both would bill it twice. These series
  include them: they measure machine time consumed, not money owed, and
  leaving those jobs out would understate it. A job that never ran, or one
  whose window ends before it starts, contributes no seconds while still
  counting as a job — the same "discard, do not subtract" rule the reports use.
- **Project tags**, as an admin-defined controlled vocabulary. The `tags` table
  and the `ProjectTags` join have existed since the PostgreSQL migration
  (`af5d842`, 2025-09-30) and are created by `sequelize.sync()`, but nothing
  above the model layer ever used them: no route, no service, no schema, no
  documentation. This adds the missing half.
  - `GET /api/tags` is open to any authenticated user, because a project admin
    needs the list to pick from; `POST`, `PUT` and `DELETE /api/tags/{id}` are
    platform-admin only, which is what makes the vocabulary controlled rather
    than free text.
  - `PUT /api/projects/{id}/tags` assigns them, open to platform admins,
    organization managers, and the project admins of that project. Deliberately
    a sub-resource rather than a field on `PUT /api/projects/{id}`, which is
    admin and organization-manager only: widening that so a PI could set tags
    would also let them change budgets and dates.
  - Assignment takes **ids and replaces the whole set** — an empty array clears
    it, and an id outside the vocabulary is a 400 rather than a new tag.
    Accepting names would invite creating a tag by typo, which is the one thing
    a controlled vocabulary exists to prevent.
  - Deleting a tag a project still carries is **refused** (409) instead of
    cascading. Silently stripping a label off a set of projects is not something
    an admin can undo, or notice.
  - Projects now carry their tags in the read path, so a list can show them
    without a request per row. The list query is `distinct`, because a
    many-to-many join would otherwise make the count count project-tag pairs
    and hand react-admin a `Content-Range` that disagrees with the page.
  - **No migration**: the tables already exist. Additive and empty by default,
    so it cannot change existing behaviour.
- **Per-organization series on `/metrics/jobs`**: `jobs_by_organization` and
  `reservations_by_organization`, labelled `organization_id` and `organization`.
  One series per organization, including organizations with no jobs or no
  reservations, which report `0` rather than disappearing from the scrape.
  Attribution runs through the **project** (job -> project -> organization),
  the same rule the billing reports use, rather than through the
  `jobs.organization_id` snapshot — two views of "jobs per organization" that
  disagreed would be worse than either. The counts are **strict**: an
  organization is credited only with what its own projects ran, so a parent
  does not absorb the counts of the organizations referencing it and the series
  sum to the true total instead of double-counting the hierarchy. The existing
  `jobs_total` and `jobs_<status>` lines are unchanged, so current scrapes and
  dashboards keep working.
- **`JOB_PORTAL_ONLY`** (default `false`): serve a job viewer only. The
  management surface is not mounted — users, projects, organizations, slots,
  reservations, logs, budget events, announcements, notifications, project
  membership, `/api/own` and `/jobAuthorizer` return 404, so the capability is
  absent rather than refused — and nothing is billed: a terminal report still
  records the job and its timing, but no budget moves and no ledger row is
  written. `GET /api/jobs` (already scoped to the caller by `restrictToUser`),
  `/auth/token`, `/jobReport`, `/userRoles` and `/metrics` remain. Exposed on
  `/config` so the dashboard can hide the views whose endpoints are gone. For a
  deployment whose authorization and accounting live elsewhere.
- **Reported billing**, opt-in via `ACCEPT_REPORTED_BILLING` (default `false`).
  The terminal `PUT /jobReport/{jobid}` may carry a `billable` integer, and that
  amount is charged in place of `execution_end - execution_start`. For
  deployments whose billable quantity is not an execution window — an HPC batch
  job charged for the QPU licenses it held over its wall time cannot be
  expressed as a pair of execution timestamps. The unit is the deployment's
  own and is subtracted from `projects.remaining_budget` verbatim, so keeping
  it consistent with the budgets is the operator's responsibility. Reports
  without the field still bill the execution window, so the two can coexist.
  New nullable `jobs.billable` column (migration
  `20260729120000-add-billable-to-jobs`), which also serves as the
  already-billed marker for reports that carry no timestamps. With the flag
  off, a reported amount is ignored with a warning and behaviour is byte-for-byte
  what it was, including the ledger description.
- **Billing reports in the API** — `GET /api/reports/{reservations,jobs,slots,utilization,summary}`
  over a `from`/`to` period, grouped by project or organization. These are the
  figures the consuntivo is built from, computed in SQL against the platform's
  own record of what ran, and they replace an external tool that dumped every
  table to CSV over a tunnel to production and aggregated them in pandas.
  The metric definitions are unchanged, deliberately, so past reports still
  reconcile:
  - a row counts only if it lies **entirely** within the period, and a bare
    date means midnight UTC — `to=2026-12-31` ends at the *start* of the 31st;
  - jobs that ran inside a reservation are excluded from the job report, since
    that time is billed as reserved hours; they are what the utilization report
    measures, against the hours their block reserved;
  - organizations are reached **through the project**, never through
    `jobs.organization_id`, which is a snapshot taken when the job was reported
    and disagrees with the project's current organization if it ever moved;
  - `free_queue` is informational and never filters a report.
  Open to platform admins, and to organization managers and auditors scoped to
  their own organization — so an organization can pull its own figures without
  anyone exporting the database. Documented in `api.yml`.
- `LICENSE` file: the project is now distributed under the European Union
  Public Licence v. 1.2 (EUPL-1.2). See the Licensing section of `README.md`
  for the rationale behind the choice and what it means in practice.
- `CONTRIBUTING.md` and `CLAUDE.md`: contribution workflow and codebase
  orientation.
- Partner attribution and expanded overview in `README.md`.
- OpenAPI/Swagger documentation: full API surface in `api.yml`, served as an
  interactive Swagger UI at `/api-docs` (`swagger-ui-express` + `js-yaml`).
- Deployment policy flags, all with defaults that preserve historical
  behaviour: `SLOT_CONSTRAINED_RESERVATIONS` and `ALLOW_FOREIGN_ORG_QUEUE_IN_SLOTS`
  (default true), `USERNAME_FORMAT` (default `email`; `any` admits non-email
  identities such as HPC accounts), and `PULSE_ACCESS_OIDC_ROLE` (default
  `pulla_user`).
- `USERNAME_FORMAT` is **frozen at first deployment** in a new `system_configs`
  table; a later boot with a conflicting value refuses to start.
- `pulla_user` per-user flag ("Pulse access") and the internal
  `GET /userRoles/:username` lookup (consumed by the QC Gateway auth plugin,
  the only role source for HPC principals whose SPANK tokens carry no roles).
  The flag is mirrored from the identity provider at login — a realm role named
  by `PULSE_ACCESS_OIDC_ROLE` grants it — and can also be set by an admin;
  the mirror never revokes, so admin grants survive role-less logins.

### Changed
- **Breaking:** the `volumes-backup` sidecar in `docker-compose.yaml` is now
  behind the `backup` compose profile and no longer starts by default. A
  development instance therefore needs no S3 endpoint or credentials at all.
  On a deployment that does back up, set `COMPOSE_PROFILES=backup` in `.env`
  (compose reads it from there, so no change to the deploy command) together
  with `AWS_ENDPOINT`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
  The endpoint used to be hardcoded to one deployment's internal address.
- `.env.example` documents the database connection (`DB_HOST`, `DB_PORT`,
  `POSTGRES_*`), `TOKEN_DURATION` and the backup settings, which were missing
  entirely, and uses placeholder host names.

### Fixed
- **Notifications are scoped to the caller again, admins included.**
  `restrictToUser` exempts platform admins so the "All Jobs" view can list
  every user's jobs, and `GET /api/notifications` inherited that exemption —
  so an admin's notification list and app-bar bell filled with other people's
  notifications (every login writes one). "Mark all as read" then tried to
  mark rows the admin did not own and got a 403 from `PATCH
  /notifications/:id/read`, which is correct but made the whole action fail.
  The scoping now lives in the service, so no query filter can widen it
  either. **Behaviour change:** an admin no longer sees other users'
  notifications anywhere in the UI.
- `api.yml`: `POST /api/projects` `budget` is documented as QPU **milliseconds**
  (it was described as hours, while the code treats it as milliseconds — the
  asymmetry with `initial_budget` on an organization, which genuinely is in
  hours, is now called out on both). Added the previously undocumented
  `GET /config` and `GET /userRoles/{username}`; added `users.pulla_user`;
  dropped `format: email` from the user identity, which is wrong under
  `USERNAME_FORMAT=any`.

### Removed
- `src/utils/populateDb.ts`: dead seeding code (imported but never called) that
  hardcoded personal e-mail addresses. Use `scripts/dev-seed.sh`, which seeds
  through the API.

### Migrations
- `reservations.slot_id` relaxed to nullable (supports slotless reservations
  when `SLOT_CONSTRAINED_RESERVATIONS=false`; existing rows unaffected).
- New `system_configs` table and additive nullable `users.pulla_user` column
  (default false).

## [2026.07.0] — 2026-07-20

First versioned release. This baseline captures the state of the project at
the time open-sourcing preparation was completed: the Lagrange platform
backend — identity, tenancy, budgets, reservations, and job accounting for a
quantum-computing service — with developer tooling, a Dockerised dev stack, and
a documented contribution flow. Changes accumulated prior to this tag are
captured here as a single inaugural entry; future releases will track
individual changes.

### Added
- Layered REST API (routes → middleware → controllers → services →
  repositories → Sequelize models) over PostgreSQL.
- Identity and tenancy model: users, organizations, projects, and
  organization-/project-scoped roles.
- Budget and billing model denominated in QPU-time, with a budget-event
  ledger.
- Reservation and slot model with configurable placement policies.
- Job authorization and reporting endpoints consumed by the QC Gateway.
- Keycloak / OIDC JWT authentication plus a backend token for
  gateway-to-API calls.
- `zod` request/query validation and react-admin-compatible `Content-Range`
  responses.
- Docker Compose deployment with an optional self-signed TLS overlay.

[Unreleased]: https://github.com/LINKS-Foundation-CPE/Lagrange-API/compare/2026.10.0...HEAD
[2026.10.0]: https://github.com/LINKS-Foundation-CPE/Lagrange-API/releases/tag/2026.10.0
[2026.07.0]: https://github.com/LINKS-Foundation-CPE/Lagrange-API/releases/tag/2026.07.0
