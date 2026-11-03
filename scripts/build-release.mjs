import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { verifyReleaseServer } from './verify-release.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const project = path.resolve(option('--project', path.join(path.dirname(fileURLToPath(import.meta.url)), '..')));
const output = path.resolve(option('--output', path.join(project, 'dist')));
const arch = option('--arch', 'x64');
const nodeVersion = '24.13.0';
if (process.platform !== 'win32' || !['x64', 'arm64'].includes(arch)) throw Error('Build on Windows for x64 or arm64');
const staging = path.join(output, 'package');
const bundle = path.join(staging, 'YoBot');
fs.mkdirSync(output, { recursive: true });
// Remove only this builder's fixed staging folder under its explicit output.
if (path.dirname(staging) !== output || path.basename(staging) !== 'package') throw Error('Unsafe staging path');
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(bundle, { recursive: true });
const copy = file => fs.cpSync(path.join(project, file), path.join(bundle, file), { recursive: true,
    filter: filename => !filename.endsWith('.log') && path.basename(filename) !== 'log' });
for (const file of ['src', 'package.json', 'package-lock.json', 'update.js', 'installer.js', 'launch.js', 'launcher.ps1', 'run.bat', 'run.html', 'run.css', 'LICENSE', 'README.md', 'CHAT_HISTORY.md']) copy(file);
// Package repository defaults rather than runtime settings, and remove all credentials.
const configSource = execFileSync('git', ['show', 'HEAD:config.js'], { cwd: project, encoding: 'utf8' });
const configuration = vm.runInNewContext(configSource.replace('export default config;', 'config;'));
function sanitize(object) {
    for (const key of Object.keys(object)) {
        if (/TOKEN|SECRET|PASSWORD|GISTID/i.test(key)) object[key] = '';
        else if (object[key] && typeof object[key] === 'object') sanitize(object[key]);
    }
}
sanitize(configuration);
configuration.CHAT_HISTORY ??= { MAX_MESSAGES_PER_USER: 9999 };
fs.writeFileSync(path.join(bundle, 'config.js'), '// config.js\nconst config = ' + JSON.stringify(configuration, null, 4) + ';\nexport default config;\n');
// Build-time npm only: the user never needs npm or an installed Node.js.
execFileSync(process.env.ComSpec || 'C:/Windows/System32/cmd.exe', ['/d', '/c', 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund'], { cwd: bundle, stdio: 'inherit', windowsHide: true });
async function download(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw Error('Download failed: HTTP ' + response.status);
    return Buffer.from(await response.arrayBuffer());
}
const filename = `node-v${nodeVersion}-win-${arch}.zip`;
const baseUrl = `https://nodejs.org/download/release/v${nodeVersion}/`;
const checksums = (await download(baseUrl + 'SHASUMS256.txt')).toString('utf8');
const expected = checksums.split(/\r?\n/).find(line => line.trim().endsWith(' ' + filename))?.split(/\s+/)[0];
if (!expected) throw Error('Official Node.js checksum missing');
const cache = path.join(output, filename);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (!fs.existsSync(cache) || hash(cache) !== expected) fs.writeFileSync(cache, await download(baseUrl + filename));
if (hash(cache) !== expected) throw Error('Official Node.js download checksum mismatch');
const runtimeTemp = path.join(staging, 'node-extracted');
fs.mkdirSync(runtimeTemp, { recursive: true });
const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:YOBOT_NODE_ZIP,$env:YOBOT_NODE_TEMP)"], { windowsHide: true, env: { ...process.env, YOBOT_NODE_ZIP: cache, YOBOT_NODE_TEMP: runtimeTemp } });
const runtimeName = `node-v${nodeVersion}-win-${arch}`;
const runtime = path.join(bundle, 'runtime', runtimeName);
fs.mkdirSync(runtime, { recursive: true });
for (const file of ['node.exe', 'LICENSE']) fs.copyFileSync(path.join(runtimeTemp, runtimeName, file), path.join(runtime, file));
if (arch === process.arch) {
    execFileSync(path.join(runtime, 'node.exe'), ['-e', "require('node:sqlite');require('express');require('ws');console.log('Packaged Node.js and dependencies verified')"], { cwd: bundle, stdio: 'inherit', windowsHide: true });
}
const files = [];
function list(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix + entry.name;
        if (entry.isSymbolicLink()) throw Error('Unexpected link in package');
        if (entry.isDirectory()) list(path.join(directory, entry.name), relative + '/');
        else files.push({ path: relative, sha256: hash(path.join(directory, entry.name)) });
    }
}
list(bundle);
const version = JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(bundle, 'release.json'), JSON.stringify({ version, arch, nodePath: `runtime/${runtimeName}/node.exe`, files }, null, 2));
if (arch === process.arch) await verifyReleaseServer(bundle);
const zip = path.join(output, 'YoBot.zip');
if (fs.existsSync(zip)) fs.unlinkSync(zip);
execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:YOBOT_BUNDLE,$env:YOBOT_OUTPUT_ZIP,[System.IO.Compression.CompressionLevel]::Optimal,$true)"], { windowsHide: true, timeout: 180000, env: { ...process.env, YOBOT_BUNDLE: bundle, YOBOT_OUTPUT_ZIP: zip } });
fs.writeFileSync(zip + '.sha256', hash(zip) + '  YoBot.zip\n');
console.log(JSON.stringify({ zip, bytes: fs.statSync(zip).size, version, arch, nodeVersion }));
