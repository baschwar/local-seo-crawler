import { build } from "esbuild";
import { cpSync, copyFileSync, chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "../../..");
const resourceDirectory = resolve(scriptDirectory, "../src-tauri/resources/sidecar");
const requireFromDatabase = createRequire(resolve(workspaceRoot, "packages/database/package.json"));
const hostArchitecture = execFileSync("uname", ["-m"], { encoding: "utf8" }).trim();

if (hostArchitecture !== process.arch) {
  throw new Error(
    `The Node runtime (${process.arch}) does not match this Mac (${hostArchitecture}). ` +
      "Build the desktop app with a native Node runtime so its bundled SQLite binding can load."
  );
}

function packageDirectory(packageName, requireFunction) {
  return dirname(requireFunction.resolve(`${packageName}/package.json`));
}

function copyPackage(packageName, requireFunction) {
  const source = packageDirectory(packageName, requireFunction);
  cpSync(source, resolve(resourceDirectory, "node_modules", packageName), { recursive: true, dereference: true });
  return createRequire(resolve(source, "package.json"));
}

rmSync(resourceDirectory, { recursive: true, force: true });
mkdirSync(resolve(resourceDirectory, "node_modules"), { recursive: true });

await build({
  entryPoints: [resolve(workspaceRoot, "apps/crawler/src/sidecar.ts")],
  outfile: resolve(resourceDirectory, "sidecar.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  external: ["better-sqlite3"],
  sourcemap: false,
  legalComments: "none"
});

copyFileSync(process.execPath, resolve(resourceDirectory, "node"));
chmodSync(resolve(resourceDirectory, "node"), 0o755);

const betterSqliteRequire = copyPackage("better-sqlite3", requireFromDatabase);
copyPackage("bindings", betterSqliteRequire);
copyPackage("file-uri-to-path", betterSqliteRequire);

if (!existsSync(resolve(resourceDirectory, "node_modules/better-sqlite3/build/Release/better_sqlite3.node"))) {
  throw new Error("The packaged better-sqlite3 native binding was not found.");
}

console.log(`Prepared bundled Node sidecar resources in ${resourceDirectory}`);
