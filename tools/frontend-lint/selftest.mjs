// Runs lint.mjs on the broken pages in fixtures/ and checks that it reports exactly the
// planted problems — so a dependency upgrade or an edit that makes the lint stop seeing
// things fails loudly instead of passing everything.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const run = spawnSync(process.execPath, [`${here}lint.mjs`, `${here}fixtures`], { encoding: "utf8" });

const expected = [
  "frontend/js/a.js:3:1  'later' is declared in a script that loads later",
  "frontend/js/a.js:4:13  'second' was used before it was defined",
  "frontend/js/a.js:5:1  'missingName' is not defined",
  "frontend/js/c.js:2:1  Parsing error",
];

const reported = run.stderr.split("\n").filter((line) => /^lint-frontend: frontend\//.test(line));
const missing = expected.filter((want) => !reported.some((line) => line.includes(want)));

if (run.status !== 1 || missing.length > 0 || reported.length !== expected.length) {
  console.error("lint-frontend selftest: the lint did not report exactly the planted problems.");
  for (const want of missing) console.error(`  not reported: ${want}`);
  console.error(`  reported (${reported.length}, expected ${expected.length}):\n${run.stderr}`);
  process.exit(1);
}
