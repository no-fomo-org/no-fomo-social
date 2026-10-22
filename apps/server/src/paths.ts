import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface AppPaths {
  webDist: string;
  migrations: string;
  ffmpeg: string;
  ffprobe: string;
}

/**
 * Where the app's own files are. Run from source, they sit next to the code and ffmpeg comes from PATH.
 * The installed app sets NO_FOMO_SOCIAL_APP_DIR to its folder, which also holds its own ffmpeg in `ffmpeg/`.
 */
export function appPaths(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): AppPaths {
  const root = env.NO_FOMO_SOCIAL_APP_DIR;
  if (!root) {
    return {
      webDist: fileURLToPath(new URL("../../web/build/client", import.meta.url)),
      migrations: fileURLToPath(new URL("../drizzle", import.meta.url)),
      ffmpeg: "ffmpeg",
      ffprobe: "ffprobe",
    };
  }
  const tool = (name: string) => {
    const file = join(root, "ffmpeg", platform === "win32" ? `${name}.exe` : name);
    return existsSync(file) ? file : name;
  };
  return { webDist: join(root, "web"), migrations: join(root, "drizzle"), ffmpeg: tool("ffmpeg"), ffprobe: tool("ffprobe") };
}
