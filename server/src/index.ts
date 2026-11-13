import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

app.listen(env?.PORT ?? 8000, () => {
  logger.info("server started", { port: env?.PORT });
});
