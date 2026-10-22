// Builds the installable app for one or more computers into dist/release.
// Each bundle holds its own Node, the bundled server, the web build, SQLite and ffmpeg,
// so users need nothing installed. Everything is downloaded with a pinned checksum.
//
//   pnpm release:bundle                       # all targets
//   pnpm release:bundle darwin-arm64          # one target
//
// Run `pnpm --filter @no-fomo-social/web build` first.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const OUT = join(ROOT, "dist/release");
const CACHE = join(ROOT, "dist/cache");
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

const NODE_VERSION = "22.23.3";
const FFMPEG_VERSION = "9.0.2";
const RIEDL = "https://ffmpeg.martin-riedl.de/download/macos";

/** Per target: Node download, ffmpeg downloads, and the SQLite prebuild to keep. */
const TARGETS = {
  "darwin-arm64": {
    node: { file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`, sha: "23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53" },
    ffmpeg: [
      { url: `${RIEDL}/arm64/1789931890_9.0.2/ffmpeg.zip`, sha: "c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924" },
      { url: `${RIEDL}/arm64/1789931890_9.0.2/ffprobe.zip`, sha: "fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6" },
    ],
    archive: "tar.gz",
  },
  "darwin-x64": {
    node: { file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`, sha: "8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8" },
    ffmpeg: [
      { url: `${RIEDL}/amd64/1789931006_9.0.2/ffmpeg.zip`, sha: "7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4" },
      { url: `${RIEDL}/amd64/1789931006_9.0.2/ffprobe.zip`, sha: "2322438ed2f6319a691291b247d09c69dcaa3a982460d1f269a7e1af335cfdfd" },
    ],
    archive: "tar.gz",
  },
  "win32-x64": {
    node: { file: `node-v${NODE_VERSION}-win-x64.zip`, sha: "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71" },
    ffmpeg: [
      {
        url: `https://github.com/GyanD/codexffmpeg/releases/download/${FFMPEG_VERSION}/ffmpeg-${FFMPEG_VERSION}-essentials_build.zip`,
        sha: "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba",
      },
    ],
    archive: "zip",
  },
};

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Downloads once into dist/cache and refuses a file whose checksum does not match. */
async function fetchPinned(url, sha) {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${sha.slice(0, 12)}-${url.split("/").pop()}`);
  if (!existsSync(file)) {
    console.log(`Downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const got = sha256(file);
  if (got !== sha) {
    rmSync(file);
    throw new Error(`Checksum mismatch for ${url}: expected ${sha}, got ${got}`);
  }
  return file;
}

/** Unpacks an archive and returns every file inside, by path. */
function unpack(archive, into) {
  mkdirSync(into, { recursive: true });
  if (archive.endsWith(".zip")) run("unzip", ["-q", "-o", archive, "-d", into]);
  else run("tar", ["-xzf", archive, "-C", into]);
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(into);
  return files;
}

const pick = (files, name) => {
  const f = files.find((p) => p.endsWith(`/${name}`) || p.endsWith(`\\${name}`));
  if (!f) throw new Error(`${name} not found in archive`);
  return f;
};

async function bundleServer(serverFile) {
  await build({
    entryPoints: [join(ROOT, "apps/server/src/packaged.ts")],
    outfile: serverFile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["better-sqlite3"],
    // Some dependencies are CommonJS and call require() at runtime.
    banner: { js: 'import { createRequire as __nfRequire } from "node:module"; const require = __nfRequire(import.meta.url);' },
    legalComments: "linked",
    logLevel: "warning",
  });
}

async function buildTarget(name, serverFile) {
  const t = TARGETS[name];
  const win = name.startsWith("win32");
  const app = join(OUT, name, "app");
  rmSync(join(OUT, name), { recursive: true, force: true });
  mkdirSync(app, { recursive: true });

  copyFileSync(serverFile, join(app, "server.mjs"));
  if (existsSync(`${serverFile}.LEGAL.txt`)) copyFileSync(`${serverFile}.LEGAL.txt`, join(app, "server.mjs.LEGAL.txt"));
  cpSync(join(ROOT, "apps/web/build/client"), join(app, "web"), { recursive: true });
  cpSync(join(ROOT, "apps/server/drizzle"), join(app, "drizzle"), { recursive: true });

  // SQLite: the JS part plus only this computer's prebuilt binary.
  const sqliteSrc = join(ROOT, "apps/server/node_modules/better-sqlite3");
  const sqlite = join(app, "node_modules/better-sqlite3");
  mkdirSync(join(sqlite, "prebuilds"), { recursive: true });
  for (const f of ["package.json", "LICENSE"]) copyFileSync(join(sqliteSrc, f), join(sqlite, f));
  cpSync(join(sqliteSrc, "lib"), join(sqlite, "lib"), { recursive: true });
  copyFileSync(join(sqliteSrc, "prebuilds", `${name}.node`), join(sqlite, "prebuilds", `${name}.node`));

  // Node.
  const nodeArchive = await fetchPinned(`https://nodejs.org/dist/v${NODE_VERSION}/${t.node.file}`, t.node.sha);
  const nodeFiles = unpack(nodeArchive, join(OUT, name, "tmp-node"));
  mkdirSync(join(app, "node"));
  copyFileSync(pick(nodeFiles, win ? "node.exe" : "bin/node"), join(app, "node", win ? "node.exe" : "node"));
  copyFileSync(pick(nodeFiles, "LICENSE"), join(app, "node", "LICENSE"));

  // ffmpeg and ffprobe.
  mkdirSync(join(app, "ffmpeg"));
  const ffFiles = [];
  for (const [i, f] of t.ffmpeg.entries()) ffFiles.push(...unpack(await fetchPinned(f.url, f.sha), join(OUT, name, `tmp-ff${i}`)));
  for (const tool of ["ffmpeg", "ffprobe"]) {
    const bin = win ? `${tool}.exe` : tool;
    copyFileSync(pick(ffFiles, bin), join(app, "ffmpeg", bin));
  }

  // Launcher and icons.
  mkdirSync(join(app, "bin"));
  mkdirSync(join(app, "icons"));
  const launcher = join(ROOT, "scripts/install/launcher");
  if (win) {
    copyFileSync(join(launcher, "no-fomo-social.ps1"), join(app, "bin/no-fomo-social.ps1"));
    copyFileSync(join(launcher, "no-fomo-social.cmd"), join(app, "bin/no-fomo-social.cmd"));
    copyFileSync(join(ROOT, "scripts/install/assets/no-fomo-social.ico"), join(app, "icons/no-fomo-social.ico"));
  } else {
    copyFileSync(join(launcher, "no-fomo-social.sh"), join(app, "bin/no-fomo-social"));
    copyFileSync(join(ROOT, "scripts/install/assets/no-fomo-social.icns"), join(app, "icons/no-fomo-social.icns"));
    for (const f of ["bin/no-fomo-social", "node/node", "ffmpeg/ffmpeg", "ffmpeg/ffprobe"]) chmodSync(join(app, f), 0o755);
  }

  copyFileSync(join(ROOT, "LICENSE"), join(app, "LICENSE"));
  writeFileSync(join(app, "THIRD_PARTY_NOTICES.txt"), notices(name));
  writeFileSync(join(app, "VERSION"), `${VERSION}\n`);

  for (const d of readdirSync(join(OUT, name))) if (d.startsWith("tmp-")) rmSync(join(OUT, name, d), { recursive: true });

  const archive = `no-fomo-social-${name}.${t.archive}`;
  rmSync(join(OUT, archive), { force: true });
  if (t.archive === "zip") run("zip", ["-q", "-r", join(OUT, archive), "app"], join(OUT, name));
  else run("tar", ["-czf", join(OUT, archive), "app"], join(OUT, name));
  console.log(`Built ${archive}`);
  return archive;
}

function notices(name) {
  const ffmpegSource = `https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz`;
  const ffmpegBuild = name.startsWith("win32") ? "https://www.gyan.dev/ffmpeg/builds/" : "https://ffmpeg.martin-riedl.de/";
  return [
    "no-fomo-social bundles these programs, each under its own license.",
    "",
    `Node.js ${NODE_VERSION} — MIT and others, see node/LICENSE. https://nodejs.org`,
    "better-sqlite3 — MIT, see node_modules/better-sqlite3/LICENSE. Includes SQLite (public domain).",
    `FFmpeg ${FFMPEG_VERSION} (ffmpeg, ffprobe) — GPL v3. Unmodified build from ${ffmpegBuild}`,
    `  Source code: ${ffmpegSource} (also attached to every no-fomo-social release).`,
    "JavaScript libraries in server.mjs — see server.mjs.LEGAL.txt.",
    "",
  ].join("\n");
}

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(TARGETS);
for (const n of names) if (!TARGETS[n]) throw new Error(`Unknown target ${n}. Use: ${Object.keys(TARGETS).join(", ")}`);
if (!existsSync(join(ROOT, "apps/web/build/client/index.html"))) throw new Error("Build the web app first: pnpm --filter @no-fomo-social/web build");

mkdirSync(OUT, { recursive: true });
const serverFile = join(OUT, "server.mjs");
await bundleServer(serverFile);
const archives = [];
for (const n of names) archives.push(await buildTarget(n, serverFile));
writeFileSync(join(OUT, "SHA256SUMS"), archives.map((a) => `${sha256(join(OUT, a))}  ${a}\n`).join(""));
console.log("Wrote SHA256SUMS");
