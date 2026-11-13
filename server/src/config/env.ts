import z from "zod";
import { logger } from "../lib/logger";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "http", "debug"]).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32, "must be at least 32 characters"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error("invalid environment variables", {
    errors: z.flattenError(parsed.error).fieldErrors,
  });
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
