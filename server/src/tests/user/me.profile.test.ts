import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { jwtVerify } from "jose";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import {
  createUser,
  deleteRateLimit,
  deleteUser,
  startServer,
} from "../helpers.js";

const server = startServer();
const emails: string[] = [];
const userIds: string[] = [];

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  userIds.push(user.userId);
  return user;
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const call = (
  method: string,
  path: string,
  token: string | undefined,
  body?: unknown,
) =>
  server.request({
    method,
    path,
    body,
    headers: token ? bearer(token) : {},
  });

afterAll(async () => {
  try {
    for (const email of emails) await deleteUser(email);
    for (const id of userIds) await deleteRateLimit(`password:fail:${id}`);
  } finally {
    server.close();
  }
});

describe("GET /me", () => {
  it("200: profile with preferences and notification preferences per PRD", async () => {
    const user = await newUser();

    const res = await call("GET", "/me", user.accessToken);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      id: user.userId,
      name: "Test",
      email: user.email,
      timezone: "Asia/Jakarta",
      preferences: { hide_balance: false },
      notification_preferences: {
        send_time: "08:00",
        quiet_hours: null,
        push: true,
        email_fallback: false,
      },
    });
    expect(JSON.stringify(json)).not.toContain("password");
  });

  it("401 without a token", async () => {
    const res = await call("GET", "/me", undefined);
    expect(res.status).toBe(401);
  });

  it("401 once the account is deleted, even with a still-valid access token", async () => {
    const user = await newUser();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, user.userId));

    const res = await call("GET", "/me", user.accessToken);

    expect(res.status).toBe(401);
  });
});

describe("access token session id", () => {
  it("carries the session family id as `sid`", async () => {
    const user = await newUser();
    const login = await (
      await server.post({
        path: "/auth/login",
        body: { email: user.email, password: user.password },
      })
    ).json();

    const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
    const { payload } = await jwtVerify(login.data.access_token, secret);

    expect(payload.sid).toBeString();

    const rotated = await (
      await server.post({
        path: "/auth/refresh",
        body: { refresh_token: login.data.refresh_token },
      })
    ).json();
    const next = await jwtVerify(rotated.data.access_token, secret);

    expect(next.payload.sid).toBe(payload.sid);
  });
});

describe("PATCH /me", () => {
  it("200: updates name (trimmed) and timezone, returns the full profile", async () => {
    const user = await newUser();

    const res = await call("PATCH", "/me", user.accessToken, {
      name: "  New Name  ",
      timezone: "Asia/Makassar",
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.name).toBe("New Name");
    expect(json.data.timezone).toBe("Asia/Makassar");
    expect(json.data.email).toBe(user.email);
    expect(json.data.notification_preferences.send_time).toBe("08:00");
  });

  it("updates one field without touching the other", async () => {
    const user = await newUser();

    const res = await call("PATCH", "/me", user.accessToken, {
      timezone: "Asia/Jayapura",
    });
    const json = await res.json();

    expect(json.data.name).toBe("Test");
    expect(json.data.timezone).toBe("Asia/Jayapura");
  });

  it("400: invalid timezone, empty name, too long name", async () => {
    const user = await newUser();

    expect(
      (await call("PATCH", "/me", user.accessToken, { timezone: "Mars/Olympus" })).status,
    ).toBe(400);
    expect(
      (await call("PATCH", "/me", user.accessToken, { name: "   " })).status,
    ).toBe(400);
    expect(
      (await call("PATCH", "/me", user.accessToken, { name: "x".repeat(101) })).status,
    ).toBe(400);
  });

  it("400: empty body and fields that may not be changed here", async () => {
    const user = await newUser();

    expect((await call("PATCH", "/me", user.accessToken, {})).status).toBe(400);
    expect(
      (await call("PATCH", "/me", user.accessToken, { email: "x@mail.test" })).status,
    ).toBe(400);
    expect(
      (await call("PATCH", "/me", user.accessToken, { password_hash: "x" })).status,
    ).toBe(400);
  });

  it("401 without a token", async () => {
    expect((await call("PATCH", "/me", undefined, { name: "x" })).status).toBe(401);
  });
});

describe("PATCH /me/preferences", () => {
  it("200: toggles hide_balance and shows it in GET /me", async () => {
    const user = await newUser();

    const res = await call("PATCH", "/me/preferences", user.accessToken, {
      hide_balance: true,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ hide_balance: true });

    const me = await (await call("GET", "/me", user.accessToken)).json();
    expect(me.data.preferences.hide_balance).toBe(true);

    const back = await call("PATCH", "/me/preferences", user.accessToken, {
      hide_balance: false,
    });
    expect((await back.json()).data).toEqual({ hide_balance: false });
  });

  it("400: missing, non-boolean, or unknown field", async () => {
    const user = await newUser();

    expect((await call("PATCH", "/me/preferences", user.accessToken, {})).status).toBe(400);
    expect(
      (await call("PATCH", "/me/preferences", user.accessToken, { hide_balance: "yes" })).status,
    ).toBe(400);
    expect(
      (
        await call("PATCH", "/me/preferences", user.accessToken, {
          hide_balance: true,
          theme: "dark",
        })
      ).status,
    ).toBe(400);
  });
});

describe("PATCH /me/notification-preferences", () => {
  it("200: updates every field and returns the notification preferences", async () => {
    const user = await newUser();

    const res = await call("PATCH", "/me/notification-preferences", user.accessToken, {
      send_time: "07:30",
      quiet_hours: { start: "22:00", end: "06:00" },
      push: false,
      email_fallback: true,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      send_time: "07:30",
      quiet_hours: { start: "22:00", end: "06:00" },
      push: false,
      email_fallback: true,
    });

    const me = await (await call("GET", "/me", user.accessToken)).json();
    expect(me.data.notification_preferences).toEqual(json.data);
  });

  it("changes only the given fields", async () => {
    const user = await newUser();

    const res = await call("PATCH", "/me/notification-preferences", user.accessToken, {
      push: false,
    });
    const json = await res.json();

    expect(json.data).toEqual({
      send_time: "08:00",
      quiet_hours: null,
      push: false,
      email_fallback: false,
    });
  });

  it("quiet_hours: null clears both columns", async () => {
    const user = await newUser();
    await call("PATCH", "/me/notification-preferences", user.accessToken, {
      quiet_hours: { start: "21:00", end: "05:00" },
    });

    const res = await call("PATCH", "/me/notification-preferences", user.accessToken, {
      quiet_hours: null,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.quiet_hours).toBeNull();

    const [row] = await db.select().from(users).where(eq(users.id, user.userId));
    expect(row!.quietHoursStart).toBeNull();
    expect(row!.quietHoursEnd).toBeNull();
  });

  it("400: bad time formats, equal quiet hours, partial quiet hours, empty body", async () => {
    const user = await newUser();
    const patch = (body: unknown) =>
      call("PATCH", "/me/notification-preferences", user.accessToken, body);

    expect((await patch({ send_time: "8:00" })).status).toBe(400);
    expect((await patch({ send_time: "24:00" })).status).toBe(400);
    expect((await patch({ send_time: "07:60" })).status).toBe(400);
    expect((await patch({ quiet_hours: { start: "22:00", end: "22:00" } })).status).toBe(400);
    expect((await patch({ quiet_hours: { start: "22:00" } })).status).toBe(400);
    expect((await patch({ push: "yes" })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ sound: true })).status).toBe(400);
  });
});

describe("POST /me/password", () => {
  const change = (token: string, current: string, next: string) =>
    call("POST", "/me/password", token, {
      current_password: current,
      new_password: next,
    });
  const login = (email: string, password: string) =>
    server.post({ path: "/auth/login", body: { email, password } });
  const refresh = (token: string) =>
    server.post({ path: "/auth/refresh", body: { refresh_token: token } });

  it("204: new password works, the old one does not", async () => {
    const user = await newUser();

    const res = await change(user.accessToken, user.password, "brand-new-pass");

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await login(user.email, "brand-new-pass")).status).toBe(200);
    expect((await login(user.email, user.password)).status).toBe(401);
  });

  it("keeps the current session and revokes every other session", async () => {
    const user = await newUser();
    const other = await (await login(user.email, user.password)).json();

    await change(user.accessToken, user.password, "brand-new-pass");

    expect((await refresh(other.data.refresh_token)).status).toBe(401);
    expect((await refresh(user.refreshToken)).status).toBe(200);
  });

  it("401 PASSWORD_INCORRECT for a wrong current password, nothing changes", async () => {
    const user = await newUser();

    const res = await change(user.accessToken, "wrong-password", "brand-new-pass");
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe("PASSWORD_INCORRECT");
    expect((await login(user.email, user.password)).status).toBe(200);
  });

  it("429 after 5 wrong current passwords, even when the next one is right", async () => {
    const user = await newUser();

    for (let i = 0; i < 5; i++) {
      expect((await change(user.accessToken, "wrong-password", "brand-new-pass")).status).toBe(401);
    }

    const locked = await change(user.accessToken, user.password, "brand-new-pass");
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("400: weak new password, missing fields, unknown field", async () => {
    const user = await newUser();

    const weak = await change(user.accessToken, user.password, "short");
    expect(weak.status).toBe(400);
    expect(Object.keys((await weak.json()).errors)).toContain("new_password");

    expect((await call("POST", "/me/password", user.accessToken, {})).status).toBe(400);
    expect(
      (
        await call("POST", "/me/password", user.accessToken, {
          current_password: user.password,
          new_password: "brand-new-pass",
          logout_others: false,
        })
      ).status,
    ).toBe(400);
  });

  it("401 without a token", async () => {
    const res = await call("POST", "/me/password", undefined, {
      current_password: "x",
      new_password: "brand-new-pass",
    });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /me", () => {
  const remove = (token: string, password: unknown) =>
    call("DELETE", "/me", token, { password });

  it("202: marks the account deleted, revokes sessions, removes devices", async () => {
    const user = await newUser();
    await server.post({
      path: "/devices",
      body: { platform: "ANDROID", push_token: `tok-${crypto.randomUUID()}` },
      headers: bearer(user.accessToken),
    });

    const res = await remove(user.accessToken, user.password);
    const json = await res.json();

    expect(res.status).toBe(202);
    expect(json.success).toBe(true);

    const [row] = await db.select().from(users).where(eq(users.id, user.userId));
    expect(row!.deletedAt).not.toBeNull();

    const refresh = await server.post({
      path: "/auth/refresh",
      body: { refresh_token: user.refreshToken },
    });
    expect(refresh.status).toBe(401);

    const login = await server.post({
      path: "/auth/login",
      body: { email: user.email, password: user.password },
    });
    expect(login.status).toBe(401);
  });

  it("the access token stops working immediately", async () => {
    const user = await newUser();

    await remove(user.accessToken, user.password);

    expect((await call("GET", "/me", user.accessToken)).status).toBe(401);
  });

  it("401 PASSWORD_INCORRECT for a wrong password, and the account stays", async () => {
    const user = await newUser();

    const res = await remove(user.accessToken, "wrong-password");
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe("PASSWORD_INCORRECT");

    const [row] = await db.select().from(users).where(eq(users.id, user.userId));
    expect(row!.deletedAt).toBeNull();
  });

  it("400: missing password or unknown field", async () => {
    const user = await newUser();

    expect((await call("DELETE", "/me", user.accessToken, {})).status).toBe(400);
    expect((await remove(user.accessToken, "")).status).toBe(400);
    expect(
      (await call("DELETE", "/me", user.accessToken, { password: "x", force: true })).status,
    ).toBe(400);
  });

  it("the email stays reserved until the data is purged", async () => {
    const user = await newUser();
    await remove(user.accessToken, user.password);

    const res = await server.post({
      path: "/auth/register",
      body: { name: "Test", email: user.email, password: "secret123" },
    });
    expect(res.status).toBe(409);
  });
});
