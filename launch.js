import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyPreparedUpdate, inside } from './installer.js';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const config = (await import('./config.js')).default;
let baseUrl = `http://127.0.0.1:${Number(config.PORT.SERVER)}`;
async function stopPreviousServer() {
    try {
        const response = await fetch(baseUrl + '/package.json', { signal: AbortSignal.timeout(1000) });
        const pkg = await response.json();
        if (pkg.name !== 'YoBot') throw Error('Another program is using the YoBot port.');
        console.log('Stopping the previous YoBot server...');
        await fetch(baseUrl + '/shutdown', { method: 'POST', signal: AbortSignal.timeout(5000) });
        for (let attempt=0;attempt<100;attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            try { await fetch(baseUrl + '/package.json', { signal: AbortSignal.timeout(300) }); }
            catch { return; }
        }
        throw Error('The previous server did not stop. Close it before starting again.');
    } catch (error) {
        if (error.cause?.code === 'ECONNREFUSED') return;
        throw error;
    }
}
try {
    await stopPreviousServer();
    const update = spawnSync(process.execPath, [path.join(root, 'update.js')], { cwd: root, stdio: 'inherit', windowsHide: true });
    if (update.status !== 0) console.log('Update unavailable; starting the installed version.');
    let updated = false;
    try { updated = applyPreparedUpdate(root); }
    catch (error) { console.error('Update failed: ' + error.message); }
    if (updated) {
        const updatedConfig = (await import('./config.js?updated')).default;
        baseUrl = `http://127.0.0.1:${Number(updatedConfig.PORT.SERVER)}`;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
    const node = inside(root, manifest.nodePath);
    if (process.env.YOBOT_VERIFY_ONLY === '1') {
        const result = spawnSync(node, ['-e', "require('node:sqlite');require('express');require('ws');console.log('Bundled runtime and production dependencies OK')"], { cwd: root, stdio: 'inherit', windowsHide: true });
        process.exit(result.status || 0);
    }
    const child = spawn(node, [path.join(root, 'src/server/server.js')], { cwd: root, stdio: 'inherit', windowsHide: true });
    let finished = false;
    // Wait for the server's own shutdown/save and stdio completion, then end
    // the launcher explicitly instead of waiting on leftover HTTP pool handles.
    child.once('close', code => {
        finished = true;
        process.exit(code ?? 1);
    });
    child.once('error', error => {
        console.error('YoBot server could not start:', error.message);
        finished = true;
        process.exit(1);
    });
    process.once('SIGINT', () => child.kill('SIGINT'));
    process.once('SIGTERM', () => child.kill('SIGTERM'));
    for (let attempt=0;attempt<100;attempt++) {
        if (finished) break;
        try {
            const response = await fetch(baseUrl + '/package.json', { signal: AbortSignal.timeout(300) });
            if (response.ok) {
                spawn(path.join(process.env.SystemRoot || 'C:/Windows', 'explorer.exe'), [`${baseUrl}/run.html`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
                break;
            }
        } catch { /* Wait for this server to start. */ }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
} catch (error) { console.error(error.message); process.exitCode = 1; }
