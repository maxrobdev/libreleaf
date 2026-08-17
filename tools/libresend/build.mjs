import { chmod, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const entry = fileURLToPath(new URL("./app.ts", import.meta.url));
const output = fileURLToPath(new URL("./dist/libresend.mjs", import.meta.url));

await mkdir(dirname(output), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: [entry],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "inline",
});
await chmod(output, 0o755);
