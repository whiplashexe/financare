import { afterAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { deviceTokens } from "../../db/schema/device.tokens.js";
import { createUser, deleteUser, startServer } from "../helpers.js";

const server = startServer();
const emails: string[] = [];

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const pushToken = () => `tok-${crypto.randomUUID()}`;

const register = (token: string | undefined, body: unknown) =>
  server.request({
    method: "POST",
    path: "/devices",
    body,
    headers: token ? bearer(token) : {},
  });
const remove = (token: string | undefined, id: string) =>
  server.request({
    method: "DELETE",
    path: `/devices/${id}`,
    headers: token ? bearer(token) : {},
  });
const rowsOf = (userId: string) =>
  db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));

afterAll(async () => {
  try {
    for (const email of emails) await deleteUser(email);
  } finally {
    server.close();
  }
});

describe("POST /devices", () => {
  it("201: registers a device and returns its id", async () => {
    const user = await newUser();
    const token = pushToken();

    const res = await register(user.accessToken, {
      platform: "ANDROID",
      push_token: token,
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data.id).toMatch(/^DVC\d{3,}$/);

    const rows = await rowsOf(user.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token).toBe(token);
    expect(rows[0]!.platform).toBe("ANDROID");
  });

  it("registering the same token again updates the row instead of duplicating it", async () => {
    const user = await newUser();
    const token = pushToken();

    const first = await (
      await register(user.accessToken, { platform: "ANDROID", push_token: token })
    ).json();
    const before = (await rowsOf(user.userId))[0]!;

    await new Promise((r) => setTimeout(r, 50));
    const second = await (
      await register(user.accessToken, { platform: "IOS", push_token: token })
    ).json();

    const rows = await rowsOf(user.userId);
    expect(second.data.id).toBe(first.data.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.platform).toBe("IOS");
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
  });

  it("a token registered by another user moves to the new owner", async () => {
    const first = await newUser();
    const second = await newUser();
    const token = pushToken();

    await register(first.accessToken, { platform: "ANDROID", push_token: token });
    await register(second.accessToken, { platform: "ANDROID", push_token: token });

    expect(await rowsOf(first.userId)).toHaveLength(0);
    expect(await rowsOf(second.userId)).toHaveLength(1);
  });

  it("one user may register several devices", async () => {
    const user = await newUser();

    await register(user.accessToken, { platform: "ANDROID", push_token: pushToken() });
    await register(user.accessToken, { platform: "IOS", push_token: pushToken() });

    expect(await rowsOf(user.userId)).toHaveLength(2);
  });

  it("400: bad platform, empty or too long token, missing fields, unknown field", async () => {
    const user = await newUser();
    const send = (body: unknown) => register(user.accessToken, body);

    expect((await send({ platform: "WINDOWS", push_token: pushToken() })).status).toBe(400);
    expect((await send({ platform: "IOS", push_token: "" })).status).toBe(400);
    expect((await send({ platform: "IOS", push_token: "x".repeat(513) })).status).toBe(400);
    expect((await send({ platform: "IOS" })).status).toBe(400);
    expect((await send({})).status).toBe(400);
    expect(
      (await send({ platform: "IOS", push_token: pushToken(), user_id: "USR001" })).status,
    ).toBe(400);
  });

  it("accepts a token of exactly 512 characters", async () => {
    const user = await newUser();

    const res = await register(user.accessToken, {
      platform: "IOS",
      push_token: "t".repeat(512),
    });

    expect(res.status).toBe(201);
  });

  it("401 without a token", async () => {
    const res = await register(undefined, { platform: "IOS", push_token: pushToken() });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /devices/:id", () => {
  it("204: removes the device", async () => {
    const user = await newUser();
    const created = await (
      await register(user.accessToken, { platform: "ANDROID", push_token: pushToken() })
    ).json();

    const res = await remove(user.accessToken, created.data.id);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(await rowsOf(user.userId)).toHaveLength(0);
  });

  it("404 for a device of another user, and it is left untouched", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const created = await (
      await register(owner.accessToken, { platform: "ANDROID", push_token: pushToken() })
    ).json();

    const res = await remove(intruder.accessToken, created.data.id);

    expect(res.status).toBe(404);
    expect(await rowsOf(owner.userId)).toHaveLength(1);
  });

  it("404 for an unknown id, with the same body as another user's device", async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const created = await (
      await register(owner.accessToken, { platform: "ANDROID", push_token: pushToken() })
    ).json();

    const foreign = await remove(intruder.accessToken, created.data.id);
    const unknown = await remove(intruder.accessToken, "DVC999999");

    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual(await foreign.json());
  });

  it("404 when removed twice", async () => {
    const user = await newUser();
    const created = await (
      await register(user.accessToken, { platform: "ANDROID", push_token: pushToken() })
    ).json();

    await remove(user.accessToken, created.data.id);
    expect((await remove(user.accessToken, created.data.id)).status).toBe(404);
  });

  it("401 without a token", async () => {
    expect((await remove(undefined, "DVC001")).status).toBe(401);
  });
});
