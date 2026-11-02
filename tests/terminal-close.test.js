import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for (const legacy of [false,true]) test('normal server exit closes CMD (legacy BAT: '+legacy+')', {skip:process.platform!=='win32'}, async t=>{
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yobot-terminal-test-'));
    t.after(()=>{
        if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('yobot-terminal-test-'))throw Error('Unsafe cleanup');
        fs.rmSync(directory,{recursive:true,force:true});
    });
    const fixture=path.join(directory,'YoBot with spaces');fs.mkdirSync(fixture);
    for(const file of ['run.bat','launcher.ps1','launch.js','installer.js'])fs.copyFileSync(path.join(project,file),path.join(fixture,file));
    if(legacy){let bat=fs.readFileSync(path.join(fixture,'run.bat'),'utf8');bat=bat.replace(/    endlocal\r?\n    exit 1\r?\n/g,'').replace(/\r?\nexit 0\s*$/,'\n');fs.writeFileSync(path.join(fixture,'run.bat'),bat);}
    fs.writeFileSync(path.join(fixture,'package.json'),'{"type":"module"}');
    const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
    const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
    fs.writeFileSync(path.join(fixture,'config.js'),`export default {PORT:{SERVER:${port}}};`);
    fs.writeFileSync(path.join(fixture,'update.js'),'console.log("No test update");');
    const runtime=`runtime/node-v24.13.0-win-${process.arch}/node.exe`;
    fs.mkdirSync(path.dirname(path.join(fixture,runtime)),{recursive:true});
    fs.copyFileSync(process.execPath,path.join(fixture,runtime));
    fs.writeFileSync(path.join(fixture,'release.json'),JSON.stringify({nodePath:runtime}));
    fs.mkdirSync(path.join(fixture,'src/server'),{recursive:true});
    fs.writeFileSync(path.join(fixture,'src/server/server.js'),'console.log("SERVER_PID="+process.pid);setTimeout(()=>{console.log("SERVER_SAVED_AND_CLOSED");process.exit(0)},100);');
    const shell=spawn(path.join(process.env.SystemRoot,'System32/cmd.exe'),['/d','/k','run.bat'],{cwd:fixture,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';shell.stdout.on('data',data=>{output+=data});shell.stderr.on('data',data=>{output+=data});
    let timer;
    try{
        const code=await Promise.race([new Promise(resolve=>shell.once('exit',resolve)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Terminal shell remained open: '+output)),10000)})]);
        assert.equal(code,0,output);assert(output.includes('SERVER_SAVED_AND_CLOSED'),output);
        const pid=Number(output.match(/SERVER_PID=(\d+)/)?.[1]);assert(pid>0);
        assert.throws(()=>process.kill(pid,0),'Server process should be gone');
    }finally{clearTimeout(timer);if(shell.exitCode===null){shell.kill();await new Promise(resolve=>shell.once('exit',resolve));}}
});
