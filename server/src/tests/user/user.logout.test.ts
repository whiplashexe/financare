import { afterAll, describe, expect, it } from "bun:test";
import { SignJWT } from "jose";
import { createUser, deleteUser, refreshRows, startServer } from "../helpers.js";

const server = startServer();
const emails: string[] = [];

const newUser = async () => {
  const user = await createUser(server);
  emails.push(user.email);
  return user;
};

const refresh = (token: string) =>
  server.post({ path: "/auth/refresh", body: { refresh_token: token } });
const logout = (token: unknown) =>
  server.post({ path: "/auth/logout", body: { refresh_token: token } });
const logoutAll = (headers?: Record<string, string>) =>
  server.post({ path: "/auth/logout-all", headers });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const signToken = (
  options: { secret?: string; expiresIn?: string | number; sub?: string } = {},
) =>
  new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(options.sub ?? "USR001")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(
      new TextEncoder().encode(
        options.secret ?? (process.env.JWT_ACCESS_SECRET as string),
      ),
    );

afterAll(async () => {
  try {
    for (const email of emails) await deleteUser(email);
  } finally {
    server.close();
  }
});

describe("POST /auth/logout", () => {
  it("204: empty body, and the refresh token no longer works", async () => {
    const user = await newUser();

    const res = await logout(user.refreshToken);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await refresh(user.refreshToken)).status).toBe(401);
  });

  it("revokes every token of the device session (the whole family)", async () => {
    const user = await newUser();
    const rotated = await (await refresh(user.refreshToken)).json();

    await logout(rotated.data.refresh_token);

    const rows = await refreshRows(user.userId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });

  it("an already rotated token still ends the device session", async () => {
    const user = await newUser();
    const rotated = await (await refresh(user.refreshToken)).json();

    const res = await logout(user.refreshToken);

    expect(res.status).toBe(204);
    expect((await refresh(rotated.data.refresh_token)).status).toBe(401);
  });

  it("does not touch other sessions of the same user", async () => {
    const user = await newUser();
    const otherLogin = await (
      await server.post({
        path: "/auth/login",
        body: { email: user.email, password: user.password },
      })
    ).json();

    await logout(user.refreshToken);

    expect((await refresh(otherLogin.data.refresh_token)).status).toBe(200);
  });

  it("204 and no error for an unknown token, and when called twice", async () => {
    const user = await newUser();

    expect((await logout("not-a-real-token")).status).toBe(204);
    expect((await logout(user.refreshToken)).status).toBe(204);
    expect((await logout(user.refreshToken)).status).toBe(204);
  });

  it("400: missing, empty, or unknown field", async () => {
    expect((await server.post({ path: "/auth/logout", body: {} })).status).toBe(400);
    expect((await logout("")).status).toBe(400);
    expect(
      (
        await server.post({
          path: "/auth/logout",
          body: { refresh_token: "x", all: true },
        })
      ).status,
    ).toBe(400);
  });
});

describe("POST /auth/logout-all", () => {
  it("204: revokes every session of the user", async () => {
    const user = await newUser();
    const secondLogin = await (
      await server.post({
        path: "/auth/login",
        body: { email: user.email, password: user.password },
      })
    ).json();

    const res = await logoutAll(bearer(user.accessToken));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");

    const rows = await refreshRows(user.userId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect((await refresh(user.refreshToken)).status).toBe(401);
    expect((await refresh(secondLogin.data.refresh_token)).status).toBe(401);
  });

  it("does not touch sessions of other users", async () => {
    const user = await newUser();
    const other = await newUser();

    await logoutAll(bearer(user.accessToken));

    expect((await refresh(other.refreshToken)).status).toBe(200);
  });

  it("the access token stays valid for logout-all itself (idempotent)", async () => {
    const user = await newUser();

    expect((await logoutAll(bearer(user.accessToken))).status).toBe(204);
    expect((await logoutAll(bearer(user.accessToken))).status).toBe(204);
  });
});

describe("authenticate middleware (via POST /auth/logout-all)", () => {
  it("401 TOKEN_MISSING without an Authorization header", async () => {
    const res = await logoutAll();
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.code).toBe("UNAUTHORIZED");
    expect(json.message).toBe("Authentication token is missing");
  });

  it("401 for a wrong scheme or a Bearer header without a token", async () => {
    expect((await logoutAll({ authorization: "Basic abc" })).status).toBe(401);
    expect((await logoutAll({ authorization: "Bearer" })).status).toBe(401);
    expect((await logoutAll({ authorization: "Bearer " })).status).toBe(401);
  });

  it("401 TOKEN_INVALID for garbage", async () => {
    const res = await logoutAll(bearer("not.a.jwt"));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.message).toBe("Authentication token is invalid");
  });

  it("401 for a token signed with a different secret", async () => {
    const forged = await signToken({ secret: "x".repeat(40) });
    expect((await logoutAll(bearer(forged))).status).toBe(401);
  });

  it("401 TOKEN_EXPIRED for an expired token", async () => {
    const expired = await signToken({ expiresIn: Math.floor(Date.now() / 1000) - 60 });

    const res = await logoutAll(bearer(expired));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe("TOKEN_EXPIRED");
  });

  it("401 for a token without a subject", async () => {
    const noSubject = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.JWT_ACCESS_SECRET as string));

    expect((await logoutAll(bearer(noSubject))).status).toBe(401);
  });

  it("accepts the scheme case-insensitively", async () => {
    const user = await newUser();
    const res = await logoutAll({ authorization: `bearer ${user.accessToken}` });
    expect(res.status).toBe(204);
  });
});
