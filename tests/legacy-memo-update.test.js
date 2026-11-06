import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import test from 'node:test';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const snapshot = (version, file) => version === '1.0.32'
    ? fs.readFileSync(path.join(project, file), 'utf8')
    : execFileSync('git', ['--work-tree=.', 'show', 'v' + version + ':' + file], { cwd: project, encoding: 'utf8' });

for (const versions of [
    ['1.0.32'],
    ['1.0.31', '1.0.32'],
    ['1.0.29', '1.0.30', '1.0.31', '1.0.32']
]) test('v1.0.27 updates through ' + versions.join(' -> ') + ' retain memo credentials', { skip: process.platform !== 'win32' }, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yobot-legacy-memo-'));
    t.after(() => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert(path.basename(directory).startsWith('yobot-legacy-memo-'));
        fs.rmSync(directory, { recursive: true, force: true });
    });
    const root = path.join(directory, 'installed');
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ type: 'module', version: '1.0.27' }));
    for (const file of ['installer.js', 'update.js']) fs.writeFileSync(path.join(root, file), snapshot('1.0.27', file));
    fs.writeFileSync(path.join(root, 'config.js'), 'const config = ' + JSON.stringify({
        UPDATE: { AUTO_UPDATE: true, GITHUB_OWNER: 'test', GITHUB_REPO: 'test', GIST: { TOKEN: 'legacy-test-token' }, BACKUP_INTERVAL: 60000 }
    }, null, 4) + '; export default config;');
    fs.mkdirSync(path.join(root, 'memo'));
    fs.writeFileSync(path.join(root, 'memo', 'memo_20261106.txt'), 'local memo');

    for (const version of versions) {
        const staging = path.join(directory, 'release-' + version);
        const bundle = path.join(staging, 'YoBot');
        fs.mkdirSync(bundle, { recursive: true });
        const nodePath = 'runtime/node-v24.13.0-win-' + process.arch + '/node.exe';
        const files = ['run.bat', 'run.html', 'run.css', 'launch.js', 'installer.js', 'update.js', 'launcher.ps1', 'config.js',
            'src/server/server.js', 'node_modules/express/package.json', nodePath, 'package.json'];
        for (const file of files) {
            const target = path.join(bundle, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            let content = 'fixture';
            if (file === 'installer.js' || file === 'update.js') content = snapshot(version, file);
            if (file === 'package.json') content = JSON.stringify({ type: 'module', version });
            if (file === 'config.js') content = 'const config = ' + JSON.stringify({
                UPDATE: { AUTO_UPDATE: true, GITHUB_OWNER: 'test', GITHUB_REPO: 'test', GIST: { TOKEN: '' }, BACKUP_INTERVAL: version === '1.0.32' ? 5000 : 60000 }
            }, null, 4) + '; export default config;';
            fs.writeFileSync(target, content);
        }
        fs.writeFileSync(path.join(bundle, 'release.json'), JSON.stringify({
            version, arch: process.arch, nodePath, files: files.map(file => ({ path: file, sha256: hash(path.join(bundle, file)) }))
        }));
        const zip = path.join(directory, version + '.zip');
        execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
            ['-NoProfile', '-NonInteractive', '-Command',
                "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:MEMO_TEST_BUNDLE,$env:MEMO_TEST_ZIP,[System.IO.Compression.CompressionLevel]::Optimal,$true)"],
            { env: { ...process.env, MEMO_TEST_BUNDLE: bundle, MEMO_TEST_ZIP: zip }, windowsHide: true });
        const bootstrap = path.join(root, 'test-update.mjs');
        const release = { tag_name: 'v' + version, assets: [
            { name: 'YoBot.zip', browser_download_url: 'https://release.test/YoBot.zip' },
            { name: 'YoBot.zip.sha256', browser_download_url: 'https://release.test/YoBot.zip.sha256' }
        ] };
        fs.writeFileSync(bootstrap, [
            "import fs from 'node:fs';",
            "import assert from 'node:assert/strict';",
            "import { applyPreparedUpdate } from './installer.js';",
            "import config from './config.js';",
            'globalThis.fetch = async url => {',
            "if (url.includes('/releases/latest')) return Response.json(" + JSON.stringify(release) + ');',
            "if (url.endsWith('.sha256')) return new Response(" + JSON.stringify(hash(zip)) + ');',
            "if (url.endsWith('.zip')) return new Response(fs.readFileSync(" + JSON.stringify(zip) + '));',
            "throw Error('Unexpected network request');",
            '};',
            "const {prepareUpdate} = await import('./update.js');",
            'assert(await prepareUpdate(process.cwd()));',
            'assert(applyPreparedUpdate(process.cwd(), {gistToken: config.UPDATE.GIST.TOKEN}));'
        ].join('\n'));
        execFileSync(process.execPath, [bootstrap], { cwd: root, windowsHide: true, stdio: 'pipe' });
        const probe = path.join(root, 'test-startup.mjs');
        fs.writeFileSync(probe, [
            "import config from './config.js';",
            "import * as installer from './installer.js';",
            'if (installer.migrateMemoBackupInterval) installer.migrateMemoBackupInterval(process.cwd(), config);',
            'if (installer.restoreGistToken) await installer.restoreGistToken(process.cwd(), config);',
            'console.log(JSON.stringify({token:config.UPDATE.GIST.TOKEN,interval:config.UPDATE.BACKUP_INTERVAL}));'
        ].join('\n'));
        const result = JSON.parse(execFileSync(process.execPath, [probe], { cwd: root, windowsHide: true, encoding: 'utf8' }));
        // v1.0.30 could clear the token until v1.0.31 restores it.
        if (version !== '1.0.30') assert.equal(result.token, 'legacy-test-token', version);
        if (version === '1.0.32') assert.equal(result.interval, 5000);
        assert.equal(fs.readFileSync(path.join(root, 'memo', 'memo_20261106.txt'), 'utf8'), 'local memo');
    }
});
