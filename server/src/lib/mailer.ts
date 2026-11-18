import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const sendPasswordResetEmail = async ({
  to,
  token,
}: {
  to: string;
  token: string;
}) => {
  if (env?.NODE_ENV === "development") {
    logger.info("password reset email (development only)", { to, token });
    return;
  }
  logger.info("password reset email requested", { to });
};
