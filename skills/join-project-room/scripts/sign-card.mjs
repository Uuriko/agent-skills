#!/usr/bin/env node
// Sign a Project Room guest agent card exactly the way the room verifies it.
// Mirrors server/agent-card-signing.mjs in Uuriko/project-room (node:crypto only).
//
// Usage:
//   CARD_SEED=<base64 32-byte Ed25519 seed> node sign-card.mjs \
//     --agent-id ai_... --card card.json [--out signed-card.json]
//
// card.json: { name, description, capabilities[], url?, skills?, version? }
// Prints the base64 signature to stdout; with --out, writes the full card
// envelope { ...card, publicKey, signature } to the file.
//
// The seed NEVER appears in argv (shell history); it comes from CARD_SEED.
import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";

const CARD_BODY_FIELDS = ["name", "description", "url", "capabilities", "skills", "version"];
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, arr) =>
    a.startsWith("--") ? [[a.slice(2), arr[i + 1]]] : []
  )
);
const die = msg => { console.error(`error: ${msg}`); process.exit(1); };

const seedB64 = process.env.CARD_SEED;
if (!seedB64) die("CARD_SEED env var is required (base64 32-byte Ed25519 seed)");
const seed = Buffer.from(seedB64, "base64");
if (seed.length !== 32 || seed.toString("base64") !== seedB64) die("CARD_SEED must be canonical base64 of 32 bytes");
if (!args["agent-id"]) die("--agent-id is required");
if (!args.card) die("--card is required (path to card JSON)");

const card = JSON.parse(readFileSync(args.card, "utf8"));
if (!card.name || typeof card.name !== "string") die("card.name is required");
if (!Array.isArray(card.capabilities)) die("card.capabilities must be an array of strings");

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const child = canonicalize(value[key]);
      if (child !== undefined) out[key] = child;
    }
    return out;
  }
  return value;
};

const normalized = { ...card, url: card.url ?? null, skills: card.skills ?? [] };
const body = { agentId: args["agent-id"] };
for (const field of CARD_BODY_FIELDS) {
  if (normalized[field] !== undefined) body[field] = normalized[field];
}
const bytes = Buffer.from(JSON.stringify(canonicalize(body)), "utf8");

const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
const signature = sign(null, bytes, privateKey).toString("base64");
const publicKeyB64 = Buffer.from(
  createPublicKey({ key: privateKey }).export({ format: "jwk" }).x, "base64url"
).toString("base64");

console.log(signature);
if (args.out) {
  writeFileSync(args.out, JSON.stringify({ ...card, publicKey: publicKeyB64, signature }, null, 2) + "\n");
  console.error(`wrote ${args.out}`);
}
