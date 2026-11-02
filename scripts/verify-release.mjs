import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function verifyReleaseServer(bundle) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'yobot-release-smoke-'));
    const listener = net.createServer();
    await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const manifest = JSON.parse(fs.readFileSync(path.join(bundle, 'release.json'), 'utf8'));
    const configUrl = pathToFileURL(path.join(bundle, 'config.js')).href;
    const serverUrl = pathToFileURL(path.join(bundle, 'src/server/server.js')).href;
    const bootstrap = path.join(temporary, 'verify.mjs');
    fs.writeFileSync(bootstrap, `const {default:config}=await import(${JSON.stringify(configUrl)});config.PORT.SERVER=${port};process.env.LOCALAPPDATA=${JSON.stringify(temporary)};await import(${JSON.stringify(serverUrl)});`);
    const child = spawn(path.join(bundle, manifest.nodePath), [bootstrap], { cwd: bundle, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const exited = new Promise(resolve => child.once('exit', resolve));
    try {
        for (let i=0;i<100&&!output.includes('Server running at')&&child.exitCode===null;i++) await new Promise(resolve=>setTimeout(resolve,100));
        assert(output.includes('Server running at'), 'Packaged server failed to start: '+output);
        const base = 'http://127.0.0.1:'+port;
        const setup = await fetch(base+'/run.html');
        assert.equal(setup.status,200,'run.html');
        assert((await setup.text()).includes('id="chzzkChannelId"'),'Missing setup form');
        const css = await fetch(base+'/run.css');
        assert.equal(css.status,200,'run.css');
        assert(css.headers.get('content-type').includes('text/css'));
        for(const route of ['/index.html','/config.js','/history.html','/src/client/assets/chat/icon/chzzk/icon_24.png','/src/client/assets/chat/icon/soop/icon_24.png','/src/client/assets/chat/icon/twitch/icon_24.png']) {
            assert.equal((await fetch(base+route)).status,200,route);
        }
        const history=await fetch(base+'/api/chat-history?platform=soop&userId=smoke');
        assert.equal(history.status,200);assert.equal((await history.json()).capacity,999);
        await fetch(base+'/shutdown',{method:'POST'});
        let timeout;
        try { assert.equal(await Promise.race([exited,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Shutdown timed out')),5000);})]),0); }
        finally { clearTimeout(timeout); }
        console.log('Packaged HTTP smoke test passed: setup page, stylesheet, platform icons, chat/history pages and history API');
    } finally {
        if(child.exitCode===null){child.kill();await exited;}
        if(path.dirname(temporary)!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('yobot-release-smoke-'))throw Error('Unsafe test cleanup');
        fs.rmSync(temporary,{recursive:true,force:true});
    }
}
