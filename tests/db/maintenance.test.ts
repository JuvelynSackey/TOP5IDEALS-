import { describe, expect, it } from "vitest";
import { createTestDb, createUser, fails } from "./harness";

describe("scheduled maintenance", () => {
  it("prunes only rate-limit events older than two days and is not callable by clients", async () => {
    const db = await createTestDb({ seed: false });
    const user = await createUser(db, "Pruner");
    await db.query(
      `insert into app_private.rate_limit_events (user_id, action, created_at)
       values ($1, 'message_minute', now() - interval '3 days'), ($1, 'message_minute', now())`,
      [user.id],
    );
    const pruned = await db.query<{ n: number }>(`select app_private.prune_rate_limit_events() as n`);
    expect(pruned.rows[0]!.n).toBe(1);
    const left = await db.query<{ n: number }>(`select count(*)::int as n from app_private.rate_limit_events`);
    expect(left.rows[0]!.n).toBe(1);
    expect(await fails(db, user.id, `select app_private.prune_rate_limit_events()`)).toMatch(/permission denied/);
  });

  it("does not let client roles execute privileged internal helpers", async () => {
    const db = await createTestDb({ seed: false });
    const user = await createUser(db, "Probe");
    const probes = [
      `select app_private.complete_transaction(gen_random_uuid(), null)`,
      `select app_private.cancel_transaction_internal(gen_random_uuid(), null, 'x')`,
      `select app_private.notify($1::uuid, 'message', 'fake', 'fake', null, null, null)`,
      `select app_private.log_audit(null, 'fake', 'x', 'x')`,
      `select app_private.ensure_conversation($1::uuid, $1::uuid, null)`,
    ];
    for (const sql of probes) {
      const params = sql.includes("$1") ? [user.id] : [];
      expect(await fails(db, user.id, sql, params), sql).toMatch(/permission denied/);
      expect(await fails(db, null, sql, params), sql).toMatch(/permission denied/);
    }
    // Helpers needed by invoker-rights triggers stay callable.
    const ok = await db.transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      return (await tx.query<{ s: string }>(`select app_private.slugify('Hello World') as s`)).rows[0]!.s;
    });
    expect(ok).toBe("hello-world");
  });
});
