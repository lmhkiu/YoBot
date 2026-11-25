import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { digest, inside, verifyPackage } from './installer.js';
import config from './config.js';

export function newer(left, right) {
    if (!/^\d+\.\d+\.\d+$/.test(left) || !/^\d+\.\d+\.\d+$/.test(right)) return false;
    const a = left.split('.').map(Number), b = right.split('.').map(Number);
    for (let i=0;i<3;i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
    return false;
}
async function fetchAsset(url) {
    const response = await fetch(url, { headers: { 'User-Agent': 'YoBot-updater' }, signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw Error('Download failed: HTTP ' + response.status);
    return response;
}

async function downloadPackage(asset, zipPath, partialPath) {
    let downloaded = 0;
    let total = Number(asset.size) || 0;
    let lastShownAt = 0;
    let lastPercent = 0;
    const terminal = process.stdout;
    const megabytes = bytes => (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    const report = (done = false) => {
        const now = Date.now();
        const percent = total > 0 ? Math.min(100, Math.floor(downloaded * 100 / total)) : null;
        if (!done && percent === 100) return;
        if (!done && now - lastShownAt < 250) return;
        if (!done && !terminal.isTTY && now - lastShownAt < 2000 && (percent === null || percent - lastPercent < 10)) return;
        const filled = percent === null ? 0 : Math.floor(percent / 5);
        const progress = percent === null ? megabytes(downloaded) :
            `[${'#'.repeat(filled)}${'-'.repeat(20 - filled)}] ${percent}%  ${megabytes(downloaded)} / ${megabytes(total)}`;
        terminal.write(terminal.isTTY ? `\r[YoBot] 다운로드 ${progress}${done ? '\n' : ''}` : `[YoBot] 다운로드 ${progress}\n`);
        lastShownAt = now;
        lastPercent = percent ?? lastPercent;
    };

    console.log('[YoBot] 업데이트 다운로드 중...');
    try {
        const response = await fetchAsset(asset.browser_download_url);
        if (!response.body) throw Error('Empty package download');
        total ||= Number(response.headers.get('content-length')) || 0;
        await pipeline(Readable.fromWeb(response.body), async function* (chunks) {
            for await (const chunk of chunks) {
                downloaded += chunk.length;
                report();
                yield chunk;
            }
        }, fs.createWriteStream(partialPath));
        fs.renameSync(partialPath, zipPath);
        report(true);
    } catch (error) {
        if (terminal.isTTY && lastShownAt) terminal.write('\n');
        fs.rmSync(partialPath, { force: true });
        throw error;
    }
}
export async function prepareUpdate(root = process.cwd()) {
    if (!config.UPDATE?.AUTO_UPDATE) return false;
    const installed = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    console.log(`[YoBot] 업데이트 확인 중 · 현재 v${installed}`);
    const { GITHUB_OWNER: owner, GITHUB_REPO: repo } = config.UPDATE;
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`, { headers: { 'User-Agent': 'YoBot-updater' }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Update check failed: HTTP ' + response.status);
    const release = await response.json();
    const version = String(release.tag_name).replace(/^v/, '');
    if (!newer(version, installed)) { console.log('YoBot is up to date.'); return false; }
    const zip = release.assets?.find(asset => asset.name === 'YoBot.zip');
    const checksum = release.assets?.find(asset => asset.name === 'YoBot.zip.sha256');
    if (!zip || !checksum) throw Error('The new release has no complete YoBot.zip package. Keeping the installed version.');
    console.log(`[YoBot] 새 버전 발견 · v${version}`);
    const updateDir = inside(root, '.update');
    fs.mkdirSync(updateDir, { recursive: true });
    const zipPath = inside(root, '.update/YoBot.zip');
    const checksumResponse = await fetchAsset(checksum.browser_download_url);
    const expected = (await checksumResponse.text()).trim().split(/\s+/)[0];
    if (!/^[a-f0-9]{64}$/i.test(expected)) throw Error('Invalid package checksum');
    await downloadPackage(zip, zipPath, inside(root, '.update/YoBot.zip.part'));
    console.log('[YoBot] 다운로드 파일 무결성 확인 중...');
    if (digest(zipPath) !== expected.toLowerCase()) throw Error('Downloaded package checksum mismatch');
    const extracted = inside(root, '.update/extracted');
    console.log('[YoBot] 압축 해제 및 설치 파일 검증 중...');
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
