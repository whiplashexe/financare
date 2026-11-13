import app from "@/app";
import { env } from "@/config/env";

app.listen(env?.PORT ?? 8000, () => {
  console.log("running");
});
