import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import { relations } from "./relations.js";

const pool = new Pool({
  connectionString: env?.DATABASE_URL,
  max: 10,
});

export const db = drizzle({ client: pool, relations });
