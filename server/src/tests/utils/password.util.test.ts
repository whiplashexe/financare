import { describe, expect, it } from "bun:test";
import { getDummyHash, hashPassword, verifyPassword } from "../../utils/password.util.js";

describe("getDummyHash", () => {
  it("is a valid argon2id hash with the same parameters as a real hash", async () => {
    const dummy = await getDummyHash();
    const real = await hashPassword("any-password");

    expect(dummy.startsWith("$argon2id$")).toBe(true);
    expect(dummy.split("$").slice(0, 4)).toEqual(real.split("$").slice(0, 4));
  });

  it("is computed once and reused", async () => {
    expect(await getDummyHash()).toBe(await getDummyHash());
  });

  it("does not verify against a normal password", async () => {
    expect(await verifyPassword(await getDummyHash(), "secret123")).toBe(false);
  });
});
