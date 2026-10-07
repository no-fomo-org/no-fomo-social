import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Entry of the installed app (bundled to server.mjs): its web build, migrations and ffmpeg sit next to it.
process.env.NO_FOMO_APP_DIR ??= dirname(fileURLToPath(import.meta.url));
await import("./main");
