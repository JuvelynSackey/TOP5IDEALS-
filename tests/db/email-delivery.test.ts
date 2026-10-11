import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, fails, q, type Db } from "./harness";
import { createLiveListing, makeWorld, swapOffer, type World } from "./fixtures";

let w: World;
let db: Db;

beforeEach(async () => {
  db = await createTestDb();
  w = await makeWorld(db);
});

async function optIn(userId: string) {
  await q(db, userId, `insert into public.notification_preferences (user_id, type, in_app, email) values ($1, 'offer_received', true, true)`, [userId]);
}

async function configure() {
  await db.query(`update public.app_settings set value = '"https://sandbox.api.mailtrap.io/api/send/123"' where key = 'email_api_url'`);
  await db.query(`update public.app_settings set value = '"https://top5.example"' where key = 'site_url'`);
  await db.query(`insert into vault.decrypted_secrets (name, decrypted_secret) values ('mailtrap_api_token', 'test-token')`);
}

async function queueOfferEmail() {
  await optIn(w.seller.id);
  const target = await createLiveListing(w, w.seller);
  const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
  return swapOffer(w, w.buyer, target, [mine], 0, "none");
}

const deliveries = async () =>
  (await db.query<{ status: string; attempts: number; request_id: string | null; last_error: string | null; sent_at: string | null }>(
    `select status, attempts, request_id, last_error, sent_at from public.notification_deliveries order by created_at`,
  )).rows;

const dispatch = async () => (await db.query<{ n: number }>(`select app_private.dispatch_email_deliveries() as n`)).rows[0]!.n;

describe("notification email delivery", () => {
  it("queues email only for users who opted in", async () => {
    const target = await createLiveListing(w, w.seller);
    const mine = await createLiveListing(w, w.buyer, { model: "galaxy-s23" });
    await swapOffer(w, w.buyer, target, [mine], 0, "none");
    expect(await deliveries()).toHaveLength(0);
    await queueOfferEmail();
    expect(await deliveries()).toEqual([expect.objectContaining({ status: "pending", attempts: 0 })]);
  });

  it("does nothing until both the endpoint and the Vault token are configured", async () => {
    await queueOfferEmail();
    expect(await dispatch()).toBe(0);
    await db.query(`update public.app_settings set value = '"https://sandbox.api.mailtrap.io/api/send/123"' where key = 'email_api_url'`);
    expect(await dispatch()).toBe(0);
    expect((await db.query(`select * from net._test_requests`)).rows).toHaveLength(0);
  });

  it("sends a well-formed Mailtrap request and marks it sent on a 2xx response", async () => {
    await queueOfferEmail();
    await configure();
    expect(await dispatch()).toBe(1);
    const req = (await db.query<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }>(`select url, body, headers from net._test_requests`)).rows[0]!;
    expect(req.url).toBe("https://sandbox.api.mailtrap.io/api/send/123");
    expect(req.headers.Authorization).toBe("Bearer test-token");
    expect(req.body.to).toEqual([{ email: `${w.seller.username}@example.test` }]);
    expect(req.body.subject).toBe("New swap offer");
    expect(String(req.body.text)).toMatch(/https:\/\/top5\.example\/dashboard\/offers\//);
    expect(String(req.body.html)).toContain('href="https://top5.example/dashboard/offers/');
    expect((await deliveries())[0]).toMatchObject({ status: "pending", attempts: 1 });

    const id = (await deliveries())[0]!.request_id;
    await db.query(`insert into net._http_response (id, status_code, content) values ($1, 200, '{"success":true}')`, [id]);
    expect(await dispatch()).toBe(0);
    expect((await deliveries())[0]).toMatchObject({ status: "sent", request_id: null, last_error: null });
    expect((await deliveries())[0]!.sent_at).not.toBeNull();
  });

  it("retries failures and gives up after five attempts", async () => {
    await queueOfferEmail();
    await configure();
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await dispatch()).toBe(1);
      const id = (await deliveries())[0]!.request_id;
      await db.query(`insert into net._http_response (id, status_code, content) values ($1, 401, 'Unauthorized')`, [id]);
    }
    await dispatch();
    expect((await deliveries())[0]).toMatchObject({ status: "failed", attempts: 5 });
    expect((await deliveries())[0]!.last_error).toMatch(/401/);
    expect(await dispatch()).toBe(0);
  });

  it("escapes notification text in the HTML body", async () => {
    await configure();
    await db.query(`insert into public.notification_preferences (user_id, type, in_app, email) values ($1, 'message', true, true)`, [w.seller.id]);
    await db.query(
      `select app_private.notify($1, 'message', '<script>alert(1)</script>', 'Tom & "Jerry"', '/dashboard/messages', 'conversation', 'x')`,
      [w.seller.id],
    );
    await dispatch();
    const html = String((await db.query<{ body: { html: string } }>(`select body from net._test_requests`)).rows[0]!.body.html);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Tom &amp; &quot;Jerry&quot;");
    expect(html).not.toContain("<script>");
  });

  it("keeps the sender and token reader away from client roles", async () => {
    for (const fn of ["app_private.dispatch_email_deliveries()", "app_private.email_api_token()", "app_private.reconcile_email_deliveries()"]) {
      expect(await fails(db, w.buyer.id, `select ${fn}`), fn).toMatch(/permission denied/);
      expect(await fails(db, null, `select ${fn}`), fn).toMatch(/permission denied/);
    }
  });
});
