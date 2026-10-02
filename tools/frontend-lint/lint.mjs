// Lints the static frontend the way the browser runs it. The pages load classic scripts
// that share one global scope, so a file can't be judged alone: for each HTML page, its
// local scripts are joined in <script> order and linted as one program. That catches
//   - syntax errors,
//   - names that don't exist on that page (a typo, or a script the page doesn't load),
//   - top-level code using something a later script defines (load-order bugs).
// Only rules whose violation breaks at runtime are on; style is not this tool's job.
//
//   node lint.mjs <frontend dir>      (run through script/lint-frontend)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Linter } from "eslint";
import globals from "globals";

const frontendDir = process.argv[2];
if (!frontendDir) {
  console.error("usage: node lint.mjs <frontend dir>");
  process.exit(2);
}

// Top-level code calling a function that a later script declares. Inside one script a
// function declaration is hoisted, so no-use-before-define leaves functions alone — but
// hoisting stops at the script boundary, and the call throws when the page loads.
const laterScriptFunction = {
  meta: { type: "problem", schema: [{ type: "array" }] },
  create(context) {
    const [starts] = context.options; // first line of each script in the joined program
    const scriptOf = (line) => starts.findLastIndex((start) => line >= start);
    return {
      "Program:exit"(node) {
        const scopes = [context.sourceCode.getScope(node)];
        while (scopes.length) {
          const scope = scopes.pop();
          scopes.push(...scope.childScopes);
          if (scope.variableScope.type !== "global") continue; // runs later, when called
          for (const ref of scope.references) {
            const def = ref.resolved?.defs[0];
            if (def?.type !== "FunctionName" || def.node.type !== "FunctionDeclaration") continue;
            if (scriptOf(def.node.loc.start.line) > scriptOf(ref.identifier.loc.start.line)) {
              context.report({
                node: ref.identifier,
                message: `'${ref.identifier.name}' is declared in a script that loads later; this runs before it exists.`,
              });
            }
          }
        }
      },
    };
  },
};

// `window.Name = ...` at the start of a line is how a script publishes a global without
// declaring one (window.Cable, window.OAuth); such a name exists on pages that load it.
const windowGlobals = (program) =>
  Object.fromEntries([...program.matchAll(/^window\.([A-Za-z_$][\w$]*)\s*=[^=]/gm)].map((match) => [match[1], "readonly"]));

const config = (starts, program) => [
  {
    plugins: { pikot: { rules: { "later-script-function": laterScriptFunction } } },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: { ...globals.browser, ...windowGlobals(program) },
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-undef": "error",
      "no-use-before-define": ["error", { functions: false, classes: false, variables: false }],
      "pikot/later-script-function": ["error", starts],
      "no-redeclare": "error",
      "no-const-assign": "error",
      "no-func-assign": "error",
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-unreachable": "error",
      "no-self-assign": "error",
      "valid-typeof": "error",
    },
  },
];

const localScripts = (html) =>
  [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
    .map((match) => match[1].split("?")[0])
    .filter((src) => !/^(https?:)?\/\//.test(src));

const linter = new Linter();
const problems = new Map(); // "file:line:col rule" -> text, so a shared script reports once
const pages = readdirSync(frontendDir).filter((name) => name.endsWith(".html")).sort();

for (const page of pages) {
  const scripts = localScripts(readFileSync(join(frontendDir, page), "utf8"));
  if (scripts.length === 0) continue;

  const starts = [];
  let program = "";
  let line = 1;
  for (const script of scripts) {
    let source;
    try {
      source = readFileSync(join(frontendDir, script), "utf8");
    } catch {
      continue; // a missing file is script/check-frontend's finding
    }
    if (!source.endsWith("\n")) source += "\n";
    starts.push(line);
    program += source;
    line += source.split("\n").length - 1;
  }

  for (const message of linter.verify(program, config(starts, program), { filename: `${page}.js` })) {
    const index = starts.findLastIndex((start) => message.line >= start);
    const where = `frontend/${scripts[index]}:${message.line - starts[index] + 1}:${message.column}`;
    const rule = message.ruleId ?? "syntax";
    const key = `${where} ${rule}`;
    if (!problems.has(key)) problems.set(key, `${where}  ${message.message}  [${rule}, as loaded by ${page}]`);
  }
}

if (problems.size > 0) {
  for (const text of problems.values()) console.error(`lint-frontend: ${text}`);
  console.error(`lint-frontend: ${problems.size} problem(s)`);
  process.exit(1);
}
console.log(`lint-frontend: ok (${pages.length} pages)`);
