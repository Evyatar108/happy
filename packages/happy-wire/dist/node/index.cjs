'use strict';

var fs = require('node:fs/promises');
var node_child_process = require('node:child_process');
var node_os = require('node:os');
var node_util = require('node:util');
var path = require('node:path');
var node_crypto = require('node:crypto');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs);
var path__namespace = /*#__PURE__*/_interopNamespaceDefault(path);

const execFileAsync = node_util.promisify(node_child_process.execFile);
async function applyOwnerOnlyPerms(filePath) {
  if (process.platform !== "win32") {
    await fs__namespace.chmod(filePath, 384);
    return;
  }
  try {
    await execFileAsync("icacls", [
      filePath,
      "/remove:g",
      "*S-1-1-0",
      "/remove:g",
      "BUILTIN\\Users",
      "/remove:g",
      "Authenticated Users"
    ]);
    await execFileAsync("icacls", [filePath, "/inheritance:r", "/grant:r", `${node_os.userInfo().username}:(R,W)`]);
  } catch (err) {
    throw new Error(`applyOwnerOnlyPerms: failed to set owner-only ACL on "${filePath}": ${err}`);
  }
}

async function assertNoSymlinkInAncestors(dir) {
  const resolved = path__namespace.resolve(dir);
  const parsed = path__namespace.parse(resolved);
  const segments = resolved.slice(parsed.root.length).split(path__namespace.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path__namespace.join(current, segment);
    try {
      const stats = await fs__namespace.lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`atomic_write_aborted_symlink_at:${current}`);
      }
    } catch (error) {
      const code = error.code;
      if (code === "ENOENT") return;
      throw error;
    }
  }
}
async function replaceFile(tempPath, filePath) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fs__namespace.rename(tempPath, filePath);
      return;
    } catch (error) {
      const code = error.code;
      if (process.platform !== "win32" || code !== "EEXIST" && code !== "EPERM" || attempt === 4) {
        throw error;
      }
      await fs__namespace.rm(filePath, { force: true });
    }
  }
}
async function writeJsonAtomically(filePath, value) {
  const dir = path__namespace.dirname(filePath);
  await assertNoSymlinkInAncestors(dir);
  await fs__namespace.mkdir(dir, { recursive: true });
  const realDir = await fs__namespace.realpath(dir);
  if (path__namespace.resolve(realDir) !== path__namespace.resolve(dir)) {
    throw new Error(`atomic_write_aborted_realpath_mismatch:${dir}`);
  }
  const tempPath = path__namespace.join(dir, `.${path__namespace.basename(filePath)}.${process.pid}.${Date.now()}.${node_crypto.randomUUID()}.tmp`);
  try {
    await fs__namespace.writeFile(tempPath, `${JSON.stringify(value, null, 2)}
`, { mode: 384 });
    await replaceFile(tempPath, filePath);
    await applyOwnerOnlyPerms(filePath).catch((error) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
    });
  } catch (error) {
    await fs__namespace.unlink(tempPath).catch(() => void 0);
    throw error;
  }
}

exports.applyOwnerOnlyPerms = applyOwnerOnlyPerms;
exports.writeJsonAtomically = writeJsonAtomically;
