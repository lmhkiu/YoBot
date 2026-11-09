import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function verifyReleaseServer(source) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'yobot-release-smoke-'));
    // Exercise migration on a disposable copy so runtime files never enter the archive.
    const bundle = path.join(temporary, 'YoBot');
    fs.cpSync(source, bundle, { recursive: true });
    const configPath = path.join(bundle, 'config.js');
    const configText = fs.readFileSync(configPath, 'utf8');
    assert(configText.includes('"MAX_MESSAGES_PER_USER": 9999'));
    const listener = net.createServer();
    const displayListener = net.createServer();
    for (const socket of [listener, displayListener]) {
        await new Promise((resolve, reject) => {
            socket.once('error', reject);
            socket.listen(0, '127.0.0.1', resolve);
        });
    }
    const port = listener.address().port;
    const displayPort = displayListener.address().port;
    await Promise.all([listener, displayListener].map(socket => new Promise(resolve => socket.close(resolve))));
    fs.writeFileSync(configPath, configText
        .replace(/"SERVER": \d+/, '"SERVER": ' + port)
        .replace('"MAX_MESSAGES_PER_USER": 9999', '"MAX_MESSAGES_PER_USER": 999')
        .replace('"BACKUP_INTERVAL": 5000', '"BACKUP_INTERVAL": 60000')
        .replace(/("TOKEN": )"(?:\\.|[^"\\])*"/g, '$1""'));

    const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'release.json'), 'utf8'));
    const opened = path.join(temporary, 'browser-url.txt');
    const bootstrap = path.join(temporary, 'verify.mjs');
    fs.writeFileSync(bootstrap, [
        "import { createRequire, syncBuiltinESMExports } from 'node:module';",
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        "const cp = createRequire(import.meta.url)('node:child_process');",
        'const spawnActual = cp.spawn;',
        'cp.spawn = (file, args, options) => {',
        "  if (path.basename(file).toLowerCase() !== 'explorer.exe') return spawnActual(file, args, options);",
        '  fs.writeFileSync(process.env.YOBOT_SMOKE_OPEN_URL, args[0]);',
        '  return { unref() {} };',
        '};',
        'syncBuiltinESMExports();',
        'const request = globalThis.fetch;',
        'globalThis.fetch = async (url, options) => {',
        '  const address = new URL(url);',
        "  if (address.hostname === '127.0.0.1') return request(url, options);",
        "  if (address.hostname === 'api.github.com' && address.pathname.endsWith('/releases/latest')) {",
        '    return Response.json({ tag_name: ' + JSON.stringify('v' + manifest.version) + ' });',
        '  }',
        "  throw new Error('Platform offline in launcher smoke test');",
        '};'
    ].join('\n'));
    const child = spawn(process.env.ComSpec || 'C:/Windows/System32/cmd.exe', ['/d', '/c', 'run.bat'], {
        cwd: bundle, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, LOCALAPPDATA: temporary, YOBOT_SMOKE_OPEN_URL: opened,
            NODE_OPTIONS: '--import=' + pathToFileURL(bootstrap).href }
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const exited = new Promise(resolve => child.once('close', resolve));
    try {
        for (let i = 0; i < 100 && !fs.existsSync(opened) && child.exitCode === null; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const base = 'http://127.0.0.1:' + port;
        assert(fs.existsSync(opened), 'run.bat did not launch the settings page: ' + output);
        assert.equal(fs.readFileSync(opened, 'utf8'), base + '/run.html');
        const { default: installedConfig } = await import(pathToFileURL(configPath).href);
        assert.equal(installedConfig.UPDATE.BACKUP_INTERVAL, 5000);
        const setup = await fetch(base + '/run.html');
        assert.equal(setup.status, 200);
        const setupHtml = await setup.text();
        assert(setupHtml.includes('id="chzzkChannelId"'));
        const css = await fetch(base+'/run.css');
        assert.equal(css.status,200,'run.css');
        assert(css.headers.get('content-type').includes('text/css'));
        for(const route of ['/index.html','/config.js','/history.html','/src/client/assets/chat/icon/chzzk/icon_24.png','/src/client/assets/chat/icon/soop/icon_24.png','/src/client/assets/chat/icon/twitch/icon_24.png']) {
            assert.equal((await fetch(base+route)).status,200,route);
        }
        const history=await fetch(base+'/api/chat-history?platform=soop&userId=smoke');
        assert.equal(history.status,200);assert.equal((await history.json()).capacity,9999);
        assert(fs.readFileSync(configPath, 'utf8').includes('"MAX_MESSAGES_PER_USER": 9999'));
        const notesUrl = base + '/api/chat-history/notes?platform=soop&userId=smoke';
        const written = await fetch(notesUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '매니저 댓글 검증' })
        });
        assert.equal(written.status, 201);
        const listed = await fetch(notesUrl);
        assert.equal(listed.status, 200);
        assert.deepEqual(await listed.json(), [await written.json()]);
        const memo = await fetch(base + '/api/save-memo', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '로컬 메모 API 검증', timestamp: '20261106 10:00:00' })
        });
        assert.equal(memo.status, 200);
        const savedMemo = await memo.json();
        assert(/^memo_\d{8}\.txt$/.test(savedMemo.fileName));
        assert.equal(savedMemo.backup.enabled, false);
        assert(fs.readFileSync(path.join(bundle, 'memo', savedMemo.fileName), 'utf8').includes('로컬 메모 API 검증'));
        const memoStatus = await fetch(base + '/api/memo-backup-status');
        assert.equal(memoStatus.status, 200);
        assert.equal((await memoStatus.json()).enabled, false);
        const fields = Object.fromEntries(Object.entries({
            serverPort: port,
            chatDisplayPort: displayPort,
            maxMessages: installedConfig.MAX_MESSAGES,
            chzzkChannelId: 'offline-smoke-channel',
            chzzkUrl: installedConfig.CHZZK.URL,
            chzzkWsUrl: installedConfig.CHZZK.WS_URL,
            soopBjId: '',
            soopWsUrl: installedConfig.SOOP.WS_URL,
            soopPlayerApi: installedConfig.SOOP.PLAYER_API_URL,
            twitchChannelId: ''
        }).map(([id, value]) => [id, { value: String(value) }]));
        fields.statusMessage = { style: {} };
        fields.startButton = { disabled: false };
        let navigation;
        const page = vm.createContext({
            document: { getElementById: id => fields[id] },
            window: { addEventListener() {}, location: { replace(url) { navigation = url; } } },
            fetch: (url, options) => fetch(base + url, options)
        });
        vm.runInContext(setupHtml.split('<script>')[1].split('</script>')[0], page);
        await vm.runInContext('startChat()', page);
        assert.equal(navigation, '/', fields.statusMessage.textContent);
        const browserConfig = await (await fetch(base + '/config.js')).text();
        assert(browserConfig.includes('"CHAT_DISPLAY": ' + displayPort));
        assert(browserConfig.includes('"CHANNEL_ID": "offline-smoke-channel"'));
        await new Promise((resolve, reject) => {
            const ws = new WebSocket('ws://127.0.0.1:' + displayPort);
            const timeout = setTimeout(() => { ws.close(); reject(Error('Chat WebSocket did not answer')); }, 3000);
            ws.onopen = () => ws.send(JSON.stringify({ messageType: 'ping' }));
            ws.onmessage = event => {
                clearTimeout(timeout);
                ws.close();
                if (JSON.parse(event.data).messageType === 'pong') resolve();
                else reject(Error('Unexpected chat WebSocket reply'));
            };
            ws.onerror = () => {
                clearTimeout(timeout);
                reject(Error('Chat WebSocket connection failed'));
            };
        });
        await fetch(base+'/shutdown',{method:'POST'});
        let timeout;
        try { assert.equal(await Promise.race([exited,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Shutdown timed out')),5000);})]),0); }
        finally { clearTimeout(timeout); }
        console.log('Packaged run.bat smoke test passed: setup, same-tab chat start, saved WebSocket port, and memo/history APIs');
    } catch (error) {
        console.error(output);
        throw error;
    } finally {
        if (child.exitCode === null) {
            await fetch('http://127.0.0.1:' + port + '/shutdown', { method: 'POST', signal: AbortSignal.timeout(2000) }).catch(() => {});
            if (child.exitCode === null) child.kill();
            await exited;
        }
        if(path.dirname(temporary)!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('yobot-release-smoke-'))throw Error('Unsafe test cleanup');
        fs.rmSync(temporary,{recursive:true,force:true,maxRetries:8,retryDelay:150});
    }
}
