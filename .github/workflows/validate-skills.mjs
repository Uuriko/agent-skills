// Validates every skills/*/SKILL.md against the Agent Skills frontmatter rules:
// - name: 1-64 chars, ^[a-z0-9]+(-[a-z0-9]+)*$, matches parent directory
// - description: 1-1024 chars, non-empty
// - body: <= 500 lines (Anthropic guidance)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
const skillsDir = join(root, "skills");
let failures = 0;
const fail = msg => { failures++; console.error(`FAIL: ${msg}`); };

let entries = [];
try { entries = readdirSync(skillsDir); }
catch { console.log("no skills/ directory yet — nothing to validate"); process.exit(0); }

const parseFrontmatter = text => {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return null;
  const out = {}, raw = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) { raw[kv[1]] = kv[2].trim(); out[kv[1]] = raw[kv[1]].replace(/^["']|["']$/g, ""); }
  }
  return { fields: out, raw, body: text.slice(m[0].length) };
};

for (const name of entries) {
  const dir = join(skillsDir, name);
  if (!statSync(dir).isDirectory()) continue;
  const path = join(dir, "SKILL.md");
  let text;
  try { text = readFileSync(path, "utf8"); }
  catch { fail(`${name}: missing SKILL.md`); continue; }
  const fm = parseFrontmatter(text);
  if (!fm) { fail(`${name}: no YAML frontmatter block`); continue; }
  const { fields, raw, body } = fm;
  // Unquoted ": " inside a plain YAML scalar breaks real YAML parsers
  // (skills.sh CLI rejects the skill). Multi-word plain values with ": " must be quoted.
  for (const key of ["name", "description"]) {
    const v = raw[key] || "";
    if (v.includes(": ") && !/^["'].*["']$/.test(v))
      fail(`${name}: frontmatter ${key} contains ": " but is not quoted — invalid YAML`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fields.name || "") || (fields.name || "").length > 64)
    fail(`${name}: name must be 1-64 chars, lowercase alnum + hyphens`);
  if (fields.name !== name) fail(`${name}: frontmatter name must match directory name`);
  if (!fields.description || fields.description.length > 1024)
    fail(`${name}: description must be 1-1024 chars`);
  if (body.split("\n").length > 500) fail(`${name}: body exceeds 500 lines`);
  if (!body.trim()) fail(`${name}: empty body`);
}

if (failures > 0) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log("all skills valid");
