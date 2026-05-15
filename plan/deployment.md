# Deployment Plan

This document defines the initial deployment plan for Herd.

The target platform class is Fly.io/Render-style app hosting. The current concrete default is Fly.io for the application runtime, Fly.io Managed Postgres for durable metadata, and Tigris for object/package storage. The first deployable system should stay intentionally simple: one web/realtime application, one Postgres database per environment, one private Tigris bucket, and no extra infrastructure until a measured need appears.

## Goals

- Deploy the Host dashboard, Participant client, realtime session server, and API as one Fly App.
- Use Fly.io Managed Postgres as the system of record for users, Compositions, package metadata, Performance metadata, audit events, health reports, positioning scan results, and recovery state.
- Use Tigris for package archives and media assets.
- Use email magic links for Author and Host accounts.
- Keep live Performance timing resilient to short network gaps by letting clients execute locally, as described in `authority-model.md`.
- Keep operations simple enough for rehearsals: predictable deploys, clear rollback, readable logs, and an explicit production checklist before a live Performance.
- Avoid platform choices that force global distribution before the realtime coordination model can support it.

## Non-Goals

- Multi-region active-active runtime.
- Horizontal WebSocket scaling before shared session coordination exists.
- Storing large audio assets directly in Postgres.
- Running a database inside the application Machine.
- Building a custom orchestration layer around Fly Machines.
- Participant accounts or persistent Participant identity.

## Platform Decision

Use Fly.io Managed Postgres for production database hosting.

Fly also has an older Fly Postgres app model, but Fly's current docs position that as unmanaged. Herd should use Managed Postgres for production because it includes high availability, failover, backups, metrics, scaling, support, and encryption. The older unmanaged option is acceptable only for disposable prototypes where losing data is an accepted risk.

Recommended default:

- `herd-staging`: staging Fly App.
- `herd-staging-db`: staging Managed Postgres cluster.
- `herd-production`: production Fly App.
- `herd-production-db`: production Managed Postgres cluster.

Actual Fly App names must be globally unique, so the final names may need an organization or project suffix.

## Region Strategy

Choose one primary region per environment.

Early default:

- Staging: `sjc` or `lax`, whichever is closer to the core development and rehearsal devices.
- Production: the region nearest the venue or the expected audience network.

Rationale:

- Herd is sensitive to coordination latency during setup, Host control, health reporting, and start confirmation.
- Clients execute timed musical and visual events locally, so the server does not need sub-frame event scheduling latency.
- Cross-region app/database traffic should be avoided by colocating the Fly App and Managed Postgres cluster in the same region.

Do not add additional application regions until the server can route or replicate live session state correctly. A globally distributed static frontend can be revisited later, but the realtime session server should start single-region.

## Runtime Shape

The first production deployment should run one public Fly App with these responsibilities:

- Serve the Host dashboard.
- Serve the Participant client.
- Expose HTTP APIs.
- Maintain WebSocket connections for live Performance state.
- Serve or sign access to Composition package assets.
- Emit application logs and metrics.

The application process must bind to `0.0.0.0` on the internal port configured in `fly.toml`.

Initial process model:

- `web`: the main HTTP and WebSocket process.

Possible later process groups:

- `worker`: background jobs for package validation, scan export processing, email, or cleanup.
- `scheduler`: recurring cleanup and maintenance tasks if the framework does not provide safe in-process scheduling.

Do not introduce a worker process until there is an actual async job queue and idempotent job behavior.

## Application State

Herd has two classes of state.

Durable state belongs in Postgres:

- Author and Host user records.
- Composition records owned by users.
- Package manifests and metadata owned by users.
- Package versions, hashes, and validation status.
- Tigris object keys and upload status.
- Performance setup records.
- Participant join records.
- Host actions and emergency controls.
- Health report snapshots or sampled history.
- Positioning scan metadata and exported measurement summaries.
- Audit log entries.
- Recovery checkpoints needed after server restart.

Hot live state may start in memory:

- Active WebSocket connection handles.
- Per-connection heartbeat timers.
- Short-lived lobby presence.
- Current transport broadcast cache.
- Pending readiness confirmations.

The in-memory state is acceptable for the earliest rehearsable system only if a server restart is allowed to end or degrade the active Performance. Before production claims recovery from server restart, the server must persist enough state for clients to reconnect and report their local cursor, as described in `failure-modes.md`.

## Auth And Ownership

Initial auth uses email magic links.

Account scope:

- Authors and Hosts have accounts.
- Participants remain anonymous per session.
- Participant device IDs are pseudonymous session/runtime identifiers, not user accounts.

Ownership model:

- A User owns Compositions and Packages.
- A Package is a versioned, validated runnable artifact derived from a Composition.
- A Performance session references a Package or an authored Composition snapshot.
- Organization, venue, and event ownership are deferred until there is a concrete collaboration requirement.

Initial infrastructure ownership:

- One project owner controls infrastructure, secrets, deployment, and Tigris/Postgres access.
- Broader admin/team ownership is deferred.

First persistence target:

- Save authored Compositions and Packages.
- Session/event-log persistence comes after creator/package persistence unless operational evidence forces it earlier.

Current implementation scaffold:

- Authoring can save Compositions and create package records through local server endpoints.
- The server uses an in-memory creator store for local development and switches to a Postgres-backed creator store when `DATABASE_URL` is configured.
- `apps/server/migrations/001_creator_storage.sql` defines the first Postgres schema for users, Compositions, and Packages.
- `pnpm --filter @herd/server db:migrate` runs unapplied SQL migrations with `DIRECT_DATABASE_URL` or `DATABASE_URL`.
- Tigris-compatible signed upload URL generation is available when object-storage environment variables are present.
- Email magic-link account sessions and deployed Tigris verification are still pending.

## Postgres Usage

Use the Managed Postgres pooled connection URL for normal application queries.

Keep a separate direct database URL for operations that need session-scoped Postgres behavior:

- schema migrations
- advisory locks
- `LISTEN/NOTIFY`, if used later
- any tool that is incompatible with PgBouncer pooling

Environment variables:

- `DATABASE_URL`: pooled application connection string.
- `DIRECT_DATABASE_URL`: direct connection string for migrations and session-scoped operations.
- `TIGRIS_ENDPOINT`: S3-compatible Tigris endpoint.
- `TIGRIS_BUCKET`: private package/media bucket.
- `TIGRIS_ACCESS_KEY_ID`: Tigris access key.
- `TIGRIS_SECRET_ACCESS_KEY`: Tigris secret key.
- `TIGRIS_REGION`: Tigris signing region, defaulting to `auto` in local server code when omitted.

Connection pool requirements:

- Keep per-process pool sizes conservative until load tests prove the required count.
- Configure max connection lifetime around 10 minutes.
- Configure idle timeout around 5 minutes.
- Use retry with backoff for transient connection failures.
- If Managed Postgres PgBouncer is set to transaction mode, disable named prepared statements in the app database client.

Migration policy:

- Migrations run during deploy through Fly's `release_command`.
- Migrations use `DIRECT_DATABASE_URL`.
- A failed migration stops the deploy.
- Destructive migrations require a rollback plan and a staged deploy where old and new application versions can tolerate the transition.

## Asset Storage

Do not store large audio samples or full package archives in Postgres long-term.

Postgres should store:

- manifest JSON
- asset metadata
- content hashes
- upload status
- ownership and access rules
- package version references

Binary asset storage uses Tigris.

Initial Tigris shape:

- One private bucket per environment.
- Scoped object keys, for example `users/{userId}/packages/{packageId}/versions/{versionId}/...`.
- Private access only through signed URLs or server-mediated reads.
- Draft and published packages both remain private at the object-storage layer.
- Participants are authorized automatically through a valid session/package join path; they should not need accounts or explicit asset login.

The deploy plan should not depend on local filesystem persistence in the app Machine. Fly Machines have an ephemeral root filesystem unless a volume is explicitly attached, and the main app should remain stateless.

## Scaling Policy

Start with one `web` Machine per environment until the realtime server is horizontally safe.

This is a deliberate tradeoff:

- One Machine avoids splitting a single Performance across isolated in-memory WebSocket state.
- It creates a single-Machine availability risk.
- It is the simplest correct architecture for Phase 1 and Phase 2.

Before scaling `web` above one Machine, implement at least one of:

- a shared session bus, such as Redis, NATS, or a Postgres-backed event channel with direct-connection caveats
- durable session snapshots and reconnect reconciliation
- routing that keeps all members of one Performance on the same Machine

Production readiness for two or more Machines requires:

- idempotent join and reconnect behavior
- duplicate-safe Host commands
- cross-Machine Participant health aggregation
- documented behavior when a Machine terminates during an active Performance
- load tests with realistic WebSocket counts

## Autostop Policy

Staging may use autostop to save cost.

Production should not autostop during rehearsal or live Performance windows. A cold start during audience join or Host control would be operationally risky.

Recommended staging behavior:

```toml
[http_service]
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0
```

Recommended production behavior during event windows:

```toml
[http_service]
  auto_stop_machines = "off"
  auto_start_machines = false
```

If production uses autostop outside event windows, the runbook must include a pre-event warmup step that confirms the app is already running before Participants join.

## Initial Fly Configuration Shape

Create `fly.toml` only after the application scaffold exists. The first version should look roughly like this:

```toml
app = "herd-production"
primary_region = "sjc"
kill_signal = "SIGTERM"
kill_timeout = 30

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[deploy]
  release_command = "/bin/sh -lc 'pnpm --filter @herd/server db:migrate'"
  release_command_timeout = "10m"
  strategy = "rolling"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = false

  [http_service.http_options]
    idle_timeout = 600

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/healthz"
```

The migration script uses `DIRECT_DATABASE_URL` when present and falls back to `DATABASE_URL`.

## Setup Commands

These commands are a template. Run them only after the application scaffold, Dockerfile, migration command, and health endpoint exist.

Create the app without deploying:

```sh
fly launch --name herd-staging --region sjc --no-deploy
```

Create Managed Postgres:

```sh
fly mpg create --name herd-staging-db --region sjc --plan basic --volume-size 10
```

Attach the app to the database:

```sh
fly mpg list
fly mpg attach <cluster-id> -a herd-staging
```

Set additional secrets:

```sh
fly secrets set \
  SESSION_SECRET="<generated-secret>" \
  APP_BASE_URL="https://herd-staging.fly.dev" \
  -a herd-staging
```

Set `DIRECT_DATABASE_URL` from the Managed Postgres dashboard connection string:

```sh
fly secrets set \
  DIRECT_DATABASE_URL="postgresql://..." \
  -a herd-staging
```

Deploy:

```sh
fly deploy -a herd-staging
```

Scale to one Machine while the realtime server is single-Machine only:

```sh
fly scale count 1 -a herd-staging
```

Check runtime status:

```sh
fly status -a herd-staging
fly logs -a herd-staging
fly secrets list -a herd-staging
```

Connect to the database for manual inspection:

```sh
fly mpg connect
```

Use `fly mpg proxy` when a local database tool needs a localhost port forwarded into the private network.

## Health Checks

The app must expose:

- `GET /healthz`: process is alive and can serve basic HTTP.
- `GET /readyz`: app can reach required dependencies, including Postgres.
- `GET /version`: build revision, build time, schema version, and runtime environment.

Fly routing health should use `/healthz`, not `/readyz`, so a temporary database issue does not necessarily remove every Machine from service. Operational monitoring should track `/readyz` separately.

## Secrets

Use Fly secrets for all sensitive runtime configuration.

Expected secrets:

- `DATABASE_URL`
- `DIRECT_DATABASE_URL`
- `SESSION_SECRET`
- email provider secrets for magic-link delivery
- `TIGRIS_ENDPOINT`
- `TIGRIS_BUCKET`
- `TIGRIS_ACCESS_KEY_ID`
- `TIGRIS_SECRET_ACCESS_KEY`
- `TIGRIS_REGION`, if the selected Tigris environment requires a non-default signing region

Do not commit `.env` files with real values. Local development should use `.env.example` with names only.

Changing Fly secrets restarts Machines. Secret rotation should be scheduled outside live Performance windows unless it is an emergency.

## CI/CD

Initial manual deploy is acceptable for Phase 0 and Phase 1.

Before production rehearsals, add CI checks:

- install dependencies
- typecheck
- unit tests
- schema validation tests
- migration dry run or migration status check
- build Docker image

Before public production, add GitHub Actions deployment:

- deploy `main` to staging automatically
- require manual approval for production
- use a Fly deploy token stored as a GitHub secret
- run smoke tests after deploy
- record the deployed commit SHA

Production deploys should not happen during a live Performance unless the Host has explicitly ended the session or accepted the operational risk.

## Release And Rollback

Release steps:

1. Confirm no active live Performance is using the target environment.
2. Confirm CI is green.
3. Confirm migration notes and rollback notes are present.
4. Deploy to staging.
5. Run a smoke Performance with at least one Host and two Participant clients.
6. Deploy to production.
7. Verify `/healthz`, `/readyz`, `/version`, Host create session, Participant join, WebSocket connect, and test tone/audio unlock.

Rollback options:

- If no schema migration is involved, roll back to the previous Fly release.
- If an additive migration is involved, roll back the app only.
- If a destructive migration is involved, follow the migration-specific rollback plan.
- If data restore is needed, restore Postgres into a new database, verify it, then repoint the app secret during a maintenance window.

## Observability

Minimum production signals:

- process uptime
- deploy version
- HTTP request count and latency
- WebSocket connection count
- active Performance count
- Participant join failures
- clock sync quality distribution
- audio unlock failure count
- health report ingest latency
- Postgres connection pool usage
- migration success/failure
- emergency stop and Host override audit events

Logs must include request IDs or session IDs where useful, but must not include secrets, database URLs, raw microphone data, or private Participant identifiers beyond the app's own pseudonymous IDs.

## Production Performance Checklist

Before a live event:

- App is already running in the selected region.
- Database status is healthy.
- Current release version is known.
- Host dashboard can create a Performance.
- Join QR code works on iOS Safari and Android Chrome.
- At least two test Participant devices can join.
- Audio unlock flow works.
- WebSocket connection remains open for at least the expected setup duration.
- `/readyz` is passing.
- Logs are visible.
- Emergency stop has been tested in the deployed environment.
- A rollback owner is identified.

## Open Decisions

- Final production Dockerfile and app packaging.
- Whether the first production rehearsal accepts single-Machine runtime risk.
- Whether cross-Machine session coordination uses Redis, NATS, Postgres direct connections, or Fly routing.
- Final production region strategy for performances outside the initial rehearsal geography.
- Email delivery provider for magic links.
- Backup restore drill schedule once real Composition and Performance data exist.

## References

- Fly.io Managed Postgres: https://fly.io/docs/mpg/
- Create and connect to Managed Postgres: https://fly.io/docs/mpg/create-and-connect/
- Managed Postgres client configuration: https://fly.io/docs/mpg/client-configuration/
- Managed Postgres cluster configuration: https://fly.io/docs/mpg/cluster-configuration/
- Fly app deployment: https://fly.io/docs/launch/deploy/
- Fly app configuration: https://fly.io/docs/reference/configuration/
- Fly secrets: https://fly.io/docs/apps/secrets/
- Fly autostop/autostart: https://fly.io/docs/launch/autostop-autostart/
- Fly private networking: https://fly.io/docs/networking/private-networking/
