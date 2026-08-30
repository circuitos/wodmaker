#!/usr/bin/env node
// Composes the full GitHub Pages site into an output directory:
//   <out>/                     build of the trunk branch (the live site)
//   <out>/previews/<branch>/   build of every other branch
//   <out>/previews/index.html  generated index of all branch previews
//
// Read-only with respect to the repo: it extracts each branch into a scratch
// directory and only writes to the output directory. Run by
// .github/workflows/deploy-pages.yml on every push; the workflow then
// force-pushes the result to the gh-pages branch, which GitHub Pages serves.
//
// Unlike a no-build static site, every tree has to go through Vite, and Vite
// needs to know the sub-path it will be served from. Each tree is therefore
// built separately with its own --base. Installs are shared between trees with
// an identical lockfile, so the usual case (branches that touched no
// dependency) runs npm ci exactly once.
//
// Local dry run:
//   git fetch origin && node scripts/build-preview-site.mjs /tmp/site
//
// Usage: build-preview-site.mjs [out-dir]
//   out-dir       output directory (default: _site; wiped first)
//   ROOT_BRANCH   env var naming the branch served at the root; the workflow
//                 passes the repo's default branch, a local dry run falls
//                 back to origin/HEAD
//   SITE_BASE     env var overriding the URL prefix Pages serves the site
//                 from (default: /<repo-name>/, derived from the remote)

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "_site");

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["pipe", "pipe", "pipe"] });

function detectTrunk() {
  try {
    return git("symbolic-ref", "--short", "refs/remotes/origin/HEAD")
      .trim().replace(/^origin\//, "");
  } catch {
    return "main";
  }
}

// Pages serves a project site under /<repo>/, so that prefix has to be baked
// into every asset URL at build time.
function detectBase() {
  if (process.env.SITE_BASE) return process.env.SITE_BASE;
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1]
    || git("remote", "get-url", "origin").trim().replace(/\.git$/, "").split("/").pop();
  return `/${repo}/`;
}

const ROOT_BRANCH = process.env.ROOT_BRANCH || detectTrunk();
const SITE_BASE = detectBase().replace(/\/*$/, "/");
// gh-pages is our own output; HEAD is the symref actions/checkout leaves behind.
const SKIP = new Set([ROOT_BRANCH, "gh-pages", "HEAD"]);

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "wodmaker-site-"));
const DEPS = path.join(WORK, "deps");

// Reuse one npm ci across every tree whose lockfile is byte-identical, which is
// nearly always all of them. A branch that changes dependencies gets its own.
function installDeps(tree) {
  const lock = path.join(tree, "package-lock.json");
  const manifest = path.join(tree, "package.json");
  const hasLock = fs.existsSync(lock);
  const key = crypto.createHash("sha256")
    .update(fs.readFileSync(hasLock ? lock : manifest))
    .digest("hex").slice(0, 16);
  const cache = path.join(DEPS, key);

  if (!fs.existsSync(cache)) {
    fs.mkdirSync(cache, { recursive: true });
    fs.copyFileSync(manifest, path.join(cache, "package.json"));
    if (hasLock) fs.copyFileSync(lock, path.join(cache, "package-lock.json"));
    console.log(`  installing dependencies (${key})`);
    execFileSync("npm", hasLock ? ["ci"] : ["install", "--no-audit", "--no-fund"],
      { cwd: cache, stdio: "inherit" });
  }
  fs.symlinkSync(path.join(cache, "node_modules"), path.join(tree, "node_modules"));
}

// Extract a branch's tree without a checkout. No shell involved, so branch
// names never touch shell quoting.
function extract(ref, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const tarball = execFileSync("git", ["archive", ref], { maxBuffer: 1 << 28 });
  execFileSync("tar", ["-x", "-C", dest], { input: tarball });
}

function copyTree(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

// Build one branch at the sub-path it will actually be served from. Returns
// false if the tree could not be built, so one broken branch never takes the
// whole deploy down with it.
function buildTree(ref, dest, base) {
  const tree = path.join(WORK, "trees", crypto.createHash("sha1").update(ref).digest("hex").slice(0, 12));
  fs.rmSync(tree, { recursive: true, force: true });
  extract(ref, tree);

  const manifest = path.join(tree, "package.json");
  const scripts = fs.existsSync(manifest)
    ? (JSON.parse(fs.readFileSync(manifest, "utf8")).scripts || {})
    : {};

  // A branch older than the build setup is still just a static tree; publish
  // it as-is rather than failing.
  if (!scripts.build) {
    console.log(`  no build script, copying tree verbatim`);
    fs.rmSync(path.join(tree, ".github"), { recursive: true, force: true });
    copyTree(tree, dest);
    return true;
  }

  installDeps(tree);
  execFileSync("npm", ["run", "build", "--", `--base=${base}`], { cwd: tree, stdio: "inherit" });
  copyTree(path.join(tree, "dist"), dest);
  return true;
}

function branchInfo(name) {
  const [sha, date, subject] = git(
    "log", "-1", "--format=%H%x00%cI%x00%s", `origin/${name}`
  ).trim().split("\0");
  return { name, sha, date, subject };
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Branch names may contain slashes; encode each path segment for hrefs.
const branchHref = (name) =>
  name.split("/").map(encodeURIComponent).join("/") + "/";

function indexHtml(branches, mainSha) {
  const rows = branches.map((b) => `
      <li class="preview">
        <a class="branch mono" href="${branchHref(b.name)}">${esc(b.name)}</a>
        <span class="meta mono">${esc(b.sha.slice(0, 7))} &middot; ${esc(b.date.slice(0, 10))}</span>
        <div class="subject">${esc(b.subject)}</div>
      </li>`).join("\n");
  const empty = `<p class="subject">No branches besides ${esc(ROOT_BRANCH)} right now. Push one and it will appear here.</p>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Branch previews &middot; WOD Generator</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;family=Inter:wght@400;500&amp;display=swap" rel="stylesheet">
<style>
:root { --board:#F4F3EE; --ink:#14171A; --ink-2:#5C6169; --rule:#CFD2CB; --red:#C8102E; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--board); color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 15px; line-height: 1.5; }
.sheet { max-width: 640px; margin: 0 auto; padding: 40px 16px 56px; }
.top { border-bottom: 2px solid var(--ink); padding-bottom: 10px; margin-bottom: 22px; }
h1 { font-family: 'Barlow Condensed', ui-sans-serif, system-ui, sans-serif; text-transform: uppercase;
  letter-spacing: .02em; line-height: .95; font-size: 40px; font-weight: 700; margin: 0; }
.tagline { font-size: 12px; color: var(--ink-2); letter-spacing: .14em; text-transform: uppercase; margin: 4px 0 0; }
.mono { font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; }
a { color: var(--red); }
ul { list-style: none; padding: 0; margin: 0; }
.preview { padding: 12px 0; border-bottom: 1px solid var(--rule); }
.branch { font-size: 14px; font-weight: 500; }
.meta { font-size: 11px; color: var(--ink-2); margin-left: 8px; }
.subject { font-size: 13px; color: var(--ink-2); margin-top: 2px; }
.foot { margin-top: 24px; font-size: 12px; color: var(--ink-2); }
</style>
</head>
<body>
<main class="sheet">
  <div class="top">
    <h1>Branch previews</h1>
    <p class="tagline">every branch, built and served</p>
  </div>
  <ul>${rows || ""}</ul>
  ${branches.length ? "" : empty}
  <p class="foot">
    Live site (<code class="mono">${esc(ROOT_BRANCH)}</code> @ <span class="mono">${esc(mainSha.slice(0, 7))}</span>): <a href="../">go to the root</a>.<br />
    Generated by <code class="mono">deploy-pages.yml</code> on every push; deleted branches drop off automatically.
  </p>
</main>
</body>
</html>
`;
}

fs.rmSync(OUT, { recursive: true, force: true });

const mainSha = git("rev-parse", `origin/${ROOT_BRANCH}`).trim();
console.log(`Building root: ${ROOT_BRANCH} @ ${mainSha.slice(0, 7)}`);
buildTree(`origin/${ROOT_BRANCH}`, OUT, SITE_BASE);
// Pages runs the site through Jekyll unless told not to.
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

const branches = git("for-each-ref", "--format=%(refname:short)", "refs/remotes/origin")
  .trim().split("\n").filter(Boolean)
  .map((r) => r.replace(/^origin\//, ""))
  .filter((b) => !SKIP.has(b))
  .map(branchInfo)
  .sort((a, b) => b.date.localeCompare(a.date));

const built = [];
for (const b of branches) {
  console.log(`Building preview: ${b.name} @ ${b.sha.slice(0, 7)}`);
  try {
    buildTree(`origin/${b.name}`, path.join(OUT, "previews", b.name),
      `${SITE_BASE}previews/${branchHref(b.name)}`);
    built.push(b);
  } catch (err) {
    // A branch that does not build is a broken branch, not a broken deploy.
    console.error(`  SKIPPED ${b.name}: ${err.message.split("\n")[0]}`);
  }
}

fs.mkdirSync(path.join(OUT, "previews"), { recursive: true });
fs.writeFileSync(path.join(OUT, "previews", "index.html"), indexHtml(built, mainSha));
fs.rmSync(WORK, { recursive: true, force: true });

console.log(`\nComposed site at ${OUT}`);
console.log(`  base: ${SITE_BASE}`);
console.log(`  root: ${ROOT_BRANCH} @ ${mainSha.slice(0, 7)}`);
for (const b of built) console.log(`  previews/${b.name}: ${b.sha.slice(0, 7)} (${b.date})`);
const skipped = branches.filter((b) => !built.includes(b));
for (const b of skipped) console.log(`  previews/${b.name}: SKIPPED (build failed)`);
