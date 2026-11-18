import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const hashPassword = (password: string) => hash(password);

export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password);

let dummyHash: Promise<string> | undefined;
export const getDummyHash = () =>
  (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));
