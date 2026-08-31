// ==========================================================================
// Build script — copies the static site into ./dist for deployment.
//
// MegaPlay Hub has no bundler and no dependencies: "building" simply means
// collecting the deployable files into a clean directory so nothing else in
// the repo (.git, node_modules, config files) can ever reach production.
// ==========================================================================
import { rm, mkdir, cp, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const ENTRIES = ["index.html", "css", "js", "data", "assets"];

async function countFiles(dir) {
  let count = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    count += entry.isDirectory() ? await countFiles(full) : 1;
  }
  return count;
}

async function build() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  for (const entry of ENTRIES) {
    const src = join(root, entry);
    if (!existsSync(src)) {
      console.warn(`  ! skipping missing entry: ${entry}`);
      continue;
    }
    const info = await stat(src);
    await cp(src, join(dist, entry), { recursive: info.isDirectory() });
    console.log(`  ✓ ${entry}`);
  }

  console.log(`\nBuilt ${await countFiles(dist)} files into ./dist`);
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
