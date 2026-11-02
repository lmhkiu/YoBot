import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { digest, inside, verifyPackage } from './installer.js';
import config from './config.js';

export function newer(left, right) {
    if (!/^\d+\.\d+\.\d+$/.test(left) || !/^\d+\.\d+\.\d+$/.test(right)) return false;
    const a = left.split('.').map(Number), b = right.split('.').map(Number);
    for (let i=0;i<3;i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
    return false;
}
async function download(url) {
    const response = await fetch(url, { headers: { 'User-Agent': 'YoBot-updater' }, signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw Error('Download failed: HTTP ' + response.status);
    return Buffer.from(await response.arrayBuffer());
}
export async function prepareUpdate(root = process.cwd()) {
    if (!config.UPDATE?.AUTO_UPDATE) return false;
    const installed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    const { GITHUB_OWNER: owner, GITHUB_REPO: repo } = config.UPDATE;
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, { headers: { 'User-Agent': 'YoBot-updater' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Update check failed: HTTP ' + response.status);
    const release = await response.json();
    const version = String(release.tag_name).replace(/^v/, '');
    if (!newer(version, installed)) { console.log('YoBot is up to date.'); return false; }
    const zip = release.assets?.find(asset => asset.name === 'YoBot.zip');
    const checksum = release.assets?.find(asset => asset.name === 'YoBot.zip.sha256');
    if (!zip || !checksum) throw Error('The new release has no complete YoBot.zip package. Keeping the installed version.');
    const updateDir = inside(root, '.update');
    fs.mkdirSync(updateDir, { recursive: true });
    const zipPath = inside(root, '.update/YoBot.zip');
    const expected = (await download(checksum.browser_download_url)).toString('utf8').trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{64}$/i.test(expected)) throw Error('Invalid package checksum');
    fs.writeFileSync(zipPath, await download(zip.browser_download_url));
    if (digest(zipPath) !== expected.toLowerCase()) throw Error('Downloaded package checksum mismatch');
    const extracted = inside(root, '.update/extracted');
    // This is a fixed, validated staging directory within this installation.
    if (fs.existsSync(extracted)) fs.rmSync(extracted, { recursive: true, force: true });
    fs.mkdirSync(extracted);
    execFileSync(path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:YOBOT_ZIP,$env:YOBOT_EXTRACT)"], { env: { ...process.env, YOBOT_ZIP: zipPath, YOBOT_EXTRACT: extracted }, windowsHide: true, timeout: 180000 });
    const manifest = verifyPackage(inside(root, '.update/extracted/YoBot'));
    if (manifest.version !== version || manifest.arch !== process.arch) throw Error('Package version or architecture mismatch');
    fs.writeFileSync(inside(root, '.update/pending.json'), JSON.stringify({ version, source: '.update/extracted/YoBot' }));
    console.log('Verified update prepared: ' + version);
    return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    prepareUpdate().catch(error => { console.error(error.message); process.exitCode = 1; });
}
