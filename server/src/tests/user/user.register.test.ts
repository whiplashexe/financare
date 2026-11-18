import { afterAll, describe, expect, it } from "bun:test";
import { deleteUser, startServer, uniqueEmail } from "../helpers.js";

const server = startServer();
const email = uniqueEmail();
const valid = { name: "Test", email, password: "secret123" };

afterAll(async () => {
  try {
    await deleteUser(email);
  } finally {
    server.close();
  }
});

const register = (body?: unknown) =>
  server.post({ path: "/auth/register", body });

describe("POST /auth/register", () => {
  it("201: returns user and tokens per PRD, without passwordHash", async () => {
    const res = await register({ ...valid, timezone: "Asia/Makassar" });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.user).toEqual({
      id: expect.stringMatching(/^USR\d{3,}$/),
      name: "Test",
      email,
      timezone: "Asia/Makassar",
    });
    expect(json.data.access_token).toBeString();
    expect(json.data.access_expires_in).toBe(900);
    expect(json.data.refresh_token).toBeString();
    expect(JSON.stringify(json)).not.toContain("passwordHash");
  });

  it("409: email already registered", async () => {
    const res = await register(valid);
    expect(res.status).toBe(409);
  });

  it("409: same email with different letter case", async () => {
    const res = await register({ ...valid, email: email.toUpperCase() });
    expect(res.status).toBe(409);
  });

  it("201: timezone defaults to Asia/Jakarta", async () => {
    const other = uniqueEmail();
    try {
      const res = await register({ ...valid, email: other });
      const json = await res.json();
      expect(res.status).toBe(201);
      expect(json.data.user.timezone).toBe("Asia/Jakarta");
    } finally {
      await deleteUser(other);
    }
  });

  it("400: invalid data returns errors per field", async () => {
    const res = await register({ name: "", email: "not-an-email", password: "123" });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(json.errors)).toEqual(
      expect.arrayContaining(["name", "email", "password"]),
    );
  });

  it("400: invalid timezone", async () => {
    const res = await register({ ...valid, email: uniqueEmail(), timezone: "Mars/Olympus" });
    expect(res.status).toBe(400);
  });

  it("400: unknown field is rejected", async () => {
    const res = await register({ ...valid, email: uniqueEmail(), role: "admin" });
    expect(res.status).toBe(400);
  });

  it("400: no body", async () => {
    const res = await register();
    expect(res.status).toBe(400);
  });
});
