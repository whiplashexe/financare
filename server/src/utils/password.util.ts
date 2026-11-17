import { hash, verify } from "@node-rs/argon2";

// argon2id (default @node-rs/argon2), output PHC string "$argon2id$..."
export const hashPassword = (password: string) => hash(password);

export const verifyPassword = (passwordHash: string, password: string) =>
  verify(passwordHash, password);
