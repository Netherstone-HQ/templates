// Checks every template folder before it reaches netherstone.app and the app.
// A template is any top-level folder whose name doesn't start with ".".
// Run from the repository root: node .github/scripts/check-templates.mjs

import fs from "node:fs";
import path from "node:path";

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const FIELDS = ["name", "line", "firstShard", "minAppVersion", "order"];
const ATTACHMENTS = "_attachments";
// The pictures the app keeps in a vault's _attachments folder.
const PICTURES = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif", "tif", "tiff"]);

const errors = [];
const fail = (file, message) => errors.push({ file, message });

const extension = (name) => path.extname(name).slice(1).toLowerCase();
const toPosix = (p) => p.split(path.sep).join("/");

/** Every file under `dir`, as paths relative to it, refusing anything hidden or linked. */
function walk(root, dir = root, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = toPosix(path.relative(path.dirname(root), full));
    if (entry.name.startsWith(".")) {
      fail(rel, "Hidden files and folders can't be in a template");
    } else if (entry.isSymbolicLink()) {
      fail(rel, "Links can't be in a template");
    } else if (entry.isDirectory()) {
      walk(root, full, files);
    } else if (entry.isFile()) {
      files.push(toPosix(path.relative(root, full)));
    }
  }
  return files;
}

/** Markdown with code removed, so links shown as code aren't checked. */
function withoutCode(markdown) {
  return markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")
    .replace(/`[^`\n]*`/g, "");
}

/** Relative link and picture targets in a shard: Markdown links and <img src>. */
function localTargets(markdown) {
  const text = withoutCode(markdown);
  const targets = [];
  for (const match of text.matchAll(/!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
    targets.push(match[1]);
  }
  for (const match of text.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    targets.push(match[1]);
  }
  return targets.filter(
    (target) =>
      !target.startsWith("#") &&
      !target.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(target),
  );
}

function decode(target) {
  try {
    return decodeURIComponent(target);
  } catch {
    return null;
  }
}

function checkTemplate(id, dir, orders) {
  if (!ID.test(id)) {
    fail(id, "Folder names are the template's id: lowercase letters, digits and single dashes");
  }

  const files = walk(dir);
  const known = new Set(files);

  for (const file of files) {
    const where = `${id}/${file}`;
    const parts = file.split("/");
    const ext = extension(file);
    if (file === "template.json") continue;
    if (parts[0] === ATTACHMENTS) {
      if (parts.length !== 2 || !PICTURES.has(ext)) {
        fail(where, `${ATTACHMENTS} holds pictures only, with no folders inside`);
      }
    } else if (ext !== "md" && ext !== "excalidraw") {
      fail(where, `Only shards (.md), drawings (.excalidraw) and pictures in ${ATTACHMENTS} can be in a template`);
    }
  }

  const meta = readJson(`${id}/template.json`, path.join(dir, "template.json"));
  if (meta) checkMeta(id, meta, known, orders);

  for (const file of files) {
    const where = `${id}/${file}`;
    const full = path.join(dir, file);
    const ext = extension(file);

    if (ext === "excalidraw") {
      const scene = readJson(where, full);
      if (scene && (scene.type !== "excalidraw" || !Array.isArray(scene.elements))) {
        fail(where, "Not a drawing: needs \"type\": \"excalidraw\" and an elements list");
      }
    }

    if (ext === "md") {
      const folder = path.posix.dirname(file);
      for (const target of localTargets(fs.readFileSync(full, "utf8"))) {
        const decoded = decode(target.split(/[?#]/)[0]);
        if (decoded === null) {
          fail(where, `Link ${target} isn't a valid address`);
          continue;
        }
        if (decoded.startsWith("/") || /^[a-z]:/i.test(decoded)) {
          fail(where, `Link ${target} must be relative to the shard`);
          continue;
        }
        const resolved = path.posix.normalize(path.posix.join(folder, decoded));
        if (resolved.startsWith("../") || resolved === "..") {
          fail(where, `Link ${target} points outside the template`);
        } else if (!known.has(resolved)) {
          fail(where, `Link ${target} doesn't resolve: there's no ${resolved} in ${id}`);
        }
      }
    }
  }
}

function readJson(where, full) {
  if (!fs.existsSync(full)) {
    fail(where, "Missing");
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    fail(where, `Not valid JSON: ${error.message}`);
    return null;
  }
}

function checkMeta(id, meta, known, orders) {
  const where = `${id}/template.json`;
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    fail(where, "Must be a JSON object");
    return;
  }
  for (const key of Object.keys(meta)) {
    if (!FIELDS.includes(key)) fail(where, `Unknown field "${key}"; the fields are ${FIELDS.join(", ")}`);
  }
  for (const key of ["name", "line"]) {
    if (typeof meta[key] !== "string" || !meta[key].trim()) fail(where, `"${key}" must be a non-empty string`);
  }
  if (typeof meta.firstShard !== "string" || !meta.firstShard.endsWith(".md")) {
    fail(where, "\"firstShard\" must be the path of a shard (.md) in the template");
  } else if (!known.has(meta.firstShard)) {
    fail(where, `"firstShard" names ${meta.firstShard}, which isn't in ${id}`);
  }
  if (typeof meta.minAppVersion !== "string" || !SEMVER.test(meta.minAppVersion)) {
    fail(where, "\"minAppVersion\" must be a version like 0.7.0 or 0.7.0-beta.1");
  }
  if (!Number.isInteger(meta.order) || meta.order < 1) {
    fail(where, "\"order\" must be a whole number from 1");
  } else if (orders.has(meta.order)) {
    fail(where, `"order" ${meta.order} is already used by ${orders.get(meta.order)}`);
  } else {
    orders.set(meta.order, id);
  }
}

const root = process.cwd();
const orders = new Map();
const ids = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name)
  .sort();

if (ids.length === 0) fail(".", "No templates found");
for (const id of ids) checkTemplate(id, path.join(root, id), orders);

for (const { file, message } of errors) {
  console.log(process.env.GITHUB_ACTIONS ? `::error file=${file}::${message}` : `${file}: ${message}`);
}
if (errors.length > 0) process.exit(1);
console.log(`${ids.length} templates checked: ${ids.join(", ")}`);
