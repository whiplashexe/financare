import app from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";

app.listen(env?.PORT ?? 8000, () => {
  logger.info("server started", { port: env?.PORT });
});
