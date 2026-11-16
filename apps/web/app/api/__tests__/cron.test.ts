// Cron endpoint auth: the bearer token must match CRON_SECRET, and the endpoint must refuse to run when unset.
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above imports, so shared state must come from vi.hoisted.
const { envState, sendDueReminders } = vi.hoisted(() => ({
  envState: { CRON_SECRET: undefined as string | undefined },
  sendDueReminders: vi.fn(async () => ({ due: 0, sent: 0, skipped: 0, failed: 0 })),
}));

vi.mock("@/lib/env", () => ({ env: envState }));
vi.mock("@/lib/reminders", () => ({ sendDueReminders: () => sendDueReminders() }));

import { GET } from "../cron/reminders/route";

const SECRET = "test-cron-secret-0123456789";

const req = (authorization?: string) =>
  new Request("http://localhost:3000/api/cron/reminders", {
    method: "GET",
    headers: authorization === undefined ? {} : { authorization },
  });

beforeEach(() => {
  envState.CRON_SECRET = SECRET;
  sendDueReminders.mockClear();
});

describe("GET /api/cron/reminders", () => {
  it("refuses every request when CRON_SECRET is not configured", async () => {
    delete envState.CRON_SECRET;
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(sendDueReminders).not.toHaveBeenCalled();
  });

  it("rejects a missing token", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(sendDueReminders).not.toHaveBeenCalled();
  });

  it("rejects a wrong token", async () => {
    const res = await GET(req("Bearer not-the-secret"));
    expect(res.status).toBe(401);
    expect(sendDueReminders).not.toHaveBeenCalled();
  });

  it("rejects the bare secret without the Bearer scheme", async () => {
    const res = await GET(req(SECRET));
    expect(res.status).toBe(401);
  });

  it("runs the reminder job and returns its counts for a valid token", async () => {
    sendDueReminders.mockResolvedValueOnce({ due: 2, sent: 2, skipped: 0, failed: 0 });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, due: 2, sent: 2, skipped: 0, failed: 0 });
    expect(sendDueReminders).toHaveBeenCalledTimes(1);
  });
});
