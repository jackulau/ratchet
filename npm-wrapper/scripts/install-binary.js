#!/usr/bin/env node
// postinstall hook  -  downloads the native biospy binary from GitHub Releases
// matching the npm package version + host platform.

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const zlib = require("node:zlib");
const tar = require("node:tls"); // unused: tar handled by spawn below

const pkg = require("../package.json");
const REPO = "jacklau/biosMCP";
const VERSION = process.env.BIOSPY_VERSION || `v${pkg.version}`;

const targets = {
  "darwin-x64":   "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "linux-x64":    "x86_64-unknown-linux-gnu",
  "linux-arm64":  "aarch64-unknown-linux-gnu",
  "win32-x64":    "x86_64-pc-windows-msvc",
};
const key = `${process.platform}-${process.arch}`;
const target = targets[key];
if (!target) {
  console.error(`biospy: no prebuilt binary for ${key}`);
  console.error(`        Build from source: https://github.com/${REPO}#build`);
  process.exit(1);
}

const asset = `biospy-${VERSION.replace(/^v/, "")}-${target}.tar.gz`;
const url = `https://github.com/${REPO}/releases/download/${VERSION}/${asset}`;
const binDir = path.join(__dirname, "..", "bin");
fs.mkdirSync(binDir, { recursive: true });
const archivePath = path.join(binDir, asset);

console.log(`biospy: downloading ${url}`);
download(url, archivePath)
  .then(() => extract(archivePath, binDir))
  .then(() => {
    const biospy = path.join(binDir, process.platform === "win32" ? "biospy.exe" : "biospy");
    const mcp = path.join(binDir, process.platform === "win32" ? "biospy-mcp.exe" : "biospy-mcp");
    if (process.platform !== "win32") {
      try { fs.chmodSync(biospy, 0o755); } catch {}
      try { fs.chmodSync(mcp, 0o755); } catch {}
    }
    fs.unlinkSync(archivePath);
    // Write the thin JS wrappers that exec the native binary.
    const wrapBiospy = path.join(binDir, "biospy.js");
    const wrapMcp = path.join(binDir, "biospy-mcp.js");
    const tpl = (name) => `#!/usr/bin/env node
const path = require("node:path");
const { spawn } = require("node:child_process");
const ext = process.platform === "win32" ? ".exe" : "";
const bin = path.join(__dirname, "${name}" + ext);
const child = spawn(bin, process.argv.slice(2), { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
`;
    fs.writeFileSync(wrapBiospy, tpl("biospy"));
    fs.writeFileSync(wrapMcp, tpl("biospy-mcp"));
    if (process.platform !== "win32") {
      fs.chmodSync(wrapBiospy, 0o755);
      fs.chmodSync(wrapMcp, 0o755);
    }
    console.log(`biospy: installed ${binDir}`);
  })
  .catch((err) => {
    console.error(`biospy install failed: ${err.message}`);
    process.exit(1);
  });

function download(downloadUrl, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    const get = (u) =>
      https
        .get(u, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} fetching ${u}`));
          }
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
        })
        .on("error", reject);
    get(downloadUrl);
  });
}

function extract(archivePath, dest) {
  // Use system tar (cross-platform on macOS/Linux; Windows 10+ ships tar.exe).
  return new Promise((resolve, reject) => {
    const { spawn } = require("node:child_process");
    const tarBin = process.platform === "win32" ? "tar.exe" : "tar";
    const proc = spawn(tarBin, ["-xzf", archivePath, "-C", dest], { stdio: "inherit" });
    proc.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))));
  });
}
