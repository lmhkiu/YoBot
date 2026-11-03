import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { verifyPackage, applyPreparedUpdate, inside, digest } from '../installer.js';

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yobot-bundle-test-'));
    t.after(() => {
        if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('yobot-bundle-test-')) throw Error('Unsafe cleanup');
        fs.rmSync(root, { recursive: true, force: true });
    });
    const source = path.join(root, '.update/extracted/YoBot');
    fs.mkdirSync(source, { recursive: true });
    const nodePath = `runtime/node-v24.13.0-win-${process.arch}/node.exe`;
    const files = ['run.bat', 'run.html', 'run.css', 'launch.js', 'installer.js', 'update.js', 'launcher.ps1', 'config.js', 'src/server/server.js', 'node_modules/express/package.json', nodePath, 'package.json'];
    for (const file of files) {
        fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
        fs.writeFileSync(path.join(source, file), file === 'package.json' ? JSON.stringify({ version: '1.0.28' }) : 'new ' + file);
    }
    const manifest = { version: '1.0.28', arch: process.arch, nodePath, files: files.map(file => ({ path: file, sha256: digest(path.join(source, file)) })) };
    fs.writeFileSync(path.join(source, 'release.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(root, '.update/pending.json'), JSON.stringify({ version: '1.0.28', source: '.update/extracted/YoBot' }));
    fs.writeFileSync(path.join(root, 'config.js'), 'personal settings');
    fs.writeFileSync(path.join(root, 'run.bat'), 'stable launcher');
    fs.mkdirSync(path.join(root, 'src/server'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/server/server.js'), 'old server');
    return { root, source, manifest };
}
test('reject traversal and corrupt packages', t => {
    const { root, source } = fixture(t);
    for (const value of ['../elsewhere', 'C:/outside', 'runtime/../../bad', 'a\\b']) assert.throws(() => inside(root, value));
    verifyPackage(source);
    fs.writeFileSync(path.join(source, 'src/server/server.js'), 'damaged');
    assert.throws(() => verifyPackage(source), /integrity/);
});
test('install complete package including config while preserving the active BAT', t => {
    const { root } = fixture(t);
    assert(applyPreparedUpdate(root));
    const backup = fs.readdirSync(path.join(root, '.update')).find(name => name.startsWith('rollback-'));
    assert.equal(fs.readFileSync(path.join(root, '.update', backup, 'config.js'), 'utf8'), 'personal settings');
    assert.equal(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), 'new config.js');
    assert.equal(fs.readFileSync(path.join(root, 'run.bat'), 'utf8'), 'stable launcher');
    assert.equal(fs.readFileSync(path.join(root, 'src/server/server.js'), 'utf8'), 'new src/server/server.js');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8')).version, '1.0.28');
    assert.equal(applyPreparedUpdate(root), false);
});
test('installation failure rolls back app files', t => {
    const { root } = fixture(t);
    assert.throws(() => applyPreparedUpdate(root, { beforeInstall(file) { if (file === 'launcher.ps1') throw Error('disk failure'); } }));
    assert.equal(fs.readFileSync(path.join(root, 'src/server/server.js'), 'utf8'), 'old server');
    assert.equal(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), 'personal settings');
    assert(!fs.existsSync(path.join(root, 'release.json')));
});
test('runtime conflicts fail before changing application files', t => {
    const { root, manifest } = fixture(t);
    const runtime = inside(root, manifest.nodePath);
    fs.mkdirSync(path.dirname(runtime), { recursive: true });
    fs.writeFileSync(runtime, 'a running different binary');
    assert.throws(() => applyPreparedUpdate(root), /runtime version/);
    assert.equal(fs.readFileSync(path.join(root, 'src/server/server.js'), 'utf8'), 'old server');
});

test('missing setup page and stylesheet are rejected before installation', t => {
    const {source}=fixture(t);
    fs.unlinkSync(path.join(source,'run.html'));
    assert.throws(()=>verifyPackage(source));
});
