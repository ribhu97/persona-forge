# ADR 0001: Use SQLite until the first production lock 503

## Status
Accepted

## Context
PersonaForge is an early-stage SaaS. At launch, operational simplicity matters more than write throughput. SQLite requires no separate database server, no connection pooling config, and no migration infrastructure — it runs from a single file.

The downside is serialized writes: under concurrent load, SQLite lock contention surfaces as a 503 `AT_CAPACITY` error (handled in `src/main.py`). WAL mode reduces read contention but writes still serialize.

## Decision
Use SQLite (WAL mode) as the production database until the first real `database is locked` 503 is observed in production.

## Consequences
- **Good**: Zero database infrastructure to manage at launch.
- **Good**: Schema changes are fast and low-friction during early iteration.
- **Bad**: Write concurrency ceiling is low; the `AT_CAPACITY` error masks the root cause from users.
- **Migration trigger**: The first production 503 caused by a SQLite lock is the signal to migrate to Postgres. This requires a schema migration and a data migration. The SQLModel/SQLAlchemy layer means the ORM code changes are minimal (connection string + engine config); the data migration needs a one-time ETL script.
