---
name: Orval params naming collision (TS2308)
description: When an OpenAPI operation has both path params AND query params, Orval generates two same-named Params types causing TS2308.
---

## Rule

If you see `TS2308: Module "./generated/api" has already exported a member named 'XxxParams'`, the cause is an operation with both path params and query params generating duplicate type names.

**Fix:** Remove the query param from the spec (handle it server-side with defaults), OR rename the operationId so the generated names don't collide.

**Why:** Orval generates `OperationNameParams` for both path params and query params separately but exports them from the same barrel with `export *`, causing the collision.

**How to apply:** After any codegen failure with TS2308, check the offending operationId in `lib/api-spec/openapi.yaml` for mixed path+query params.
