---
name: api-endpoint-design
description: Checklist for designing new HTTP/REST endpoints — naming, status codes, pagination, versioning.
---

# API Endpoint Design

## When to use this skill

Invoke this skill when adding or modifying a public HTTP/REST endpoint, or when reviewing an endpoint definition. It helps you make consistent decisions before writing handler code.

## When not to use it

- For internal RPC between services on a private network — different constraints apply.
- For GraphQL or gRPC — naming and pagination conventions differ.

## Checklist

1. **Resource naming**
   - Plural nouns for collections (`/users`, not `/user`).
   - Hierarchical paths for sub-resources (`/users/{id}/orders`).
   - Lowercase, hyphen-separated for multi-word resources.
2. **HTTP verbs**
   - `GET` is idempotent and safe — no side effects.
   - `POST` creates a new resource; `PUT` replaces; `PATCH` partially updates.
   - `DELETE` is idempotent — second call returns the same status as the first.
3. **Status codes**
   - `200` on success with a body, `204` on success with no body.
   - `400` for malformed input, `422` for semantically invalid input.
   - `404` when the resource does not exist; `409` for conflicts.
   - `429` for rate limiting; include a `Retry-After` header.
4. **Pagination**
   - Cursor-based for large or frequently-changing data sets.
   - Include `next` and `prev` cursors in the response body.
   - Cap `limit` server-side and document the cap.
5. **Versioning**
   - Prefix paths with `/v1`, `/v2`, etc.
   - Treat a version bump as a breaking change — keep the previous version live until clients have migrated.
6. **Error response shape**
   - One consistent shape across all endpoints: `{ error: { code, message, details? } }`.
   - Stable error codes; never include stack traces.

## Example

`POST /v1/users` returns `201 Created` with a `Location: /v1/users/{id}` header. `GET /v1/users?limit=20&cursor=eyJpZCI6MTAwfQ` returns a page plus a `next` cursor.

<!-- MIT, see LICENSE -->
