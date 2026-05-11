---
name: database-migration-safety
description: Patterns for zero-downtime schema migrations on relational databases.
---

# Database Migration Safety

## When to use this skill

Invoke this skill before authoring any schema migration that will run against a database with live traffic. The goal is to avoid blocking writes, breaking deployed code, or leaving the schema in a half-applied state.

## When not to use it

- Single-instance development databases — feel free to drop and recreate.
- Schema changes to a system with a documented maintenance window — different tradeoffs apply.

## Core principles

1. **Expand before contract.** Add new columns/tables first, deploy the code that writes both old and new shapes, backfill, then read from the new shape, and only then remove the old shape in a later migration.
2. **Migrations should be small and reversible.** One logical change per migration. Add a `down` step that exactly reverses the `up`.
3. **Avoid long-running locks.** On large tables, `ALTER TABLE ADD COLUMN` with a non-null default rewrites every row. Add the column nullable first, backfill in batches, then add the constraint.
4. **Indexes go up concurrently.** Use `CREATE INDEX CONCURRENTLY` (Postgres) or the equivalent for your engine. Verify on a copy of production data first — concurrent index builds can still fail.
5. **No data migrations in DDL transactions.** Backfills run in batches in a separate script with retry logic.

## Common pitfalls

- Renaming a column in one step breaks every reader the moment the migration runs. Add the new column, dual-write, migrate readers, then drop the old.
- `NOT NULL` plus default on a billion-row table can lock the table for minutes. Add nullable, backfill, then add the constraint.
- Foreign keys validated retroactively scan the entire child table. Add `NOT VALID` first, then `VALIDATE CONSTRAINT` in a separate step.

## Verification checklist

- [ ] Migration runs cleanly against a recent prod snapshot.
- [ ] Rollback path tested.
- [ ] Application code handles both pre- and post-migration shapes during deploy.
- [ ] Backfill batches sized so each runs in well under a transaction timeout.

<!-- MIT, see LICENSE -->
