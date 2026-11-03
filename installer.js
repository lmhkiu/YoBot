import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const APPLICATION_FILES = ['src', 'node_modules', 'config.js', 'package.json', 'package-lock.json', 'update.js', 'installer.js', 'launch.js', 'launcher.ps1', 'release.json', 'run.html', 'run.css', 'LICENSE', 'README.md', 'CHAT_HISTORY.md'];
export function inside(root, relative) {
    if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..' || part.includes(':'))) throw Error('Unsafe package path');
    const target = path.resolve(root, relative);
    if (!target.startsWith(path.resolve(root) + path.sep)) throw Error('Package path escapes installation');
    return target;
}
export const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function copyTree(source, target) {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw Error('Package links are not allowed');
    if (stat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        for (const name of fs.readdirSync(source)) copyTree(path.join(source, name), path.join(target, name));
    } else fs.copyFileSync(source, target);
}
export function verifyPackage(directory) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || !/^runtime\/node-v\d+\.\d+\.\d+-win-(x64|arm64)\/node\.exe$/.test(manifest.nodePath)) throw Error('Invalid package manifest');
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) throw Error('Package file list missing');
    const paths = new Set();
    for (const file of manifest.files) {
        const absolute = inside(directory, file.path);
        if (paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) || !fs.lstatSync(absolute).isFile() || digest(absolute) !== file.sha256) throw Error('Package integrity check failed: ' + file.path);
        paths.add(file.path);
    }
    for (const required of ['package.json', 'run.bat', 'run.html', 'run.css', 'launch.js', 'installer.js', 'update.js', 'launcher.ps1', 'config.js', 'src/server/server.js', 'node_modules/express/package.json', manifest.nodePath]) {
        if (!paths.has(required)) throw Error('Incomplete package: ' + required);
    }
    if (JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).version !== manifest.version) throw Error('Package version mismatch');
    // Reject files not covered by the manifest, including links.
    function walk(relative = '') {
        for (const name of fs.readdirSync(relative ? inside(directory, relative) : directory)) {
            const file = relative ? relative + '/' + name : name;
            if (file === 'release.json') continue;
            const stat = fs.lstatSync(inside(directory, file));
            if (stat.isSymbolicLink()) throw Error('Links are not allowed in release packages');
            if (stat.isDirectory()) walk(file);
            else if (!paths.has(file)) throw Error('Unverified package file: ' + file);
        }
    }
    walk();
    return manifest;
}

export function applyPreparedUpdate(root, { beforeInstall } = {}) {
    const pendingPath = path.join(root, '.update', 'pending.json');
    if (!fs.existsSync(pendingPath)) return false;
    const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
    if (pending.source !== '.update/extracted/YoBot') throw Error('Invalid pending update path');
    const source = inside(root, pending.source);
    const manifest = verifyPackage(source);
    if (manifest.version !== pending.version) throw Error('Pending version mismatch');
    if (manifest.arch !== process.arch) throw Error('Update CPU architecture mismatch');
    // Reuse identical runtime files; never overwrite a running node.exe.
    for (const file of manifest.files.filter(file => file.path.startsWith('runtime/'))) {
        const target = inside(root, file.path);
        if (fs.existsSync(target)) {
            if (digest(target) !== file.sha256) throw Error('Conflicting runtime version; refusing to overwrite');
        } else {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(inside(source, file.path), target);
        }
    }
    const backup = inside(root, '.update/rollback-' + Date.now());
    fs.mkdirSync(backup, { recursive: true });
    const moved = [];
    try {
        for (const file of APPLICATION_FILES.filter(file => file !== 'release.json')) {
            const incoming = inside(source, file);
            if (!fs.existsSync(incoming)) continue;
            const target = inside(root, file), previous = inside(backup, file);
            const existed = fs.existsSync(target);
            if (existed) fs.renameSync(target, previous);
            moved.push({ target, previous, existed });
            beforeInstall?.(file);
            copyTree(incoming, target);
        }
        // Memo files and local databases are outside the application file list.
        // Commit the selected runtime and version only after all app files succeed.
        const target = inside(root, 'release.json'), previous = inside(backup, 'release.json');
        const existed = fs.existsSync(target);
        if (existed) fs.renameSync(target, previous);
        moved.push({ target, previous, existed });
        fs.copyFileSync(path.join(source, 'release.json'), target);
        fs.unlinkSync(pendingPath);
        return true;
    } catch (error) {
        for (const { target, previous, existed } of moved.reverse()) {
            // Both paths were validated inside root before the transaction.
            if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
            if (existed) fs.renameSync(previous, target);
        }
        fs.renameSync(pendingPath, pendingPath + '.failed-' + Date.now());
        throw error;
    }
}
