import { TRACK, corridorAt } from '../src/client/game/marbleTrack.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('minimap click/drag, hold-to-follow and release use the requested camera modes', () => {
    const handlers = new Map(); const lifecycle = new Map();
    // Chainable display objects stand in for rendering only; real input handlers and camera decisions run below.
    function display(x=0,y=0,list=[]) {
        const target={x,y,list,visible:true,text:''}; let proxy;
        proxy=new Proxy(target,{get(t,key){if(key in t)return t[key];return (...args)=>{
            if(key==='setText')t.text=args[0]; if(key==='setVisible')t.visible=args[0];
            if(key==='setPosition'){t.x=args[0];t.y=args[1];} if(key==='destroy')t.destroyed=true;return proxy;
        };}});return proxy;
    }
    const Phaser={Scene:class{},Math:{Clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),Linear:(a,b,t)=>a+(b-a)*t}};
    const source=fs.readFileSync(new URL('../src/client/game/scenes/game/MarbleScene.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default class MarbleScene','class MarbleScene');
    const Scene=vm.runInNewContext(source+';MarbleScene',{Phaser,performance,TRACK,corridorAt,AvatarTextures:class{get(){return Promise.resolve(null)}destroy(){this.destroyed=true;}}});
    const scene=new Scene();const controller={state:null,receivedAt:performance.now(),sound(){},updateHud(){}};
    const camera={scrollY:0,setBounds(){}};
    Object.assign(scene,{registry:{get:()=>controller},make:{graphics:()=>display()},add:{image:display,text:display,container:display},
        input:{on:(name,handler)=>handlers.set(name,handler)},events:{once:(name,handler)=>lifecycle.set(name,handler)},cameras:{main:camera}});
    scene.create();
    const state={phase:'racing',paused:true,elapsed:5,obstacles:[],balls:[{key:'viewer',nickname:'테스트공',x:300,y:1800,color:0,rank:null}],ranking:[{key:'viewer',nickname:'테스트공',y:1800,rank:null}]};
    controller.state=state;scene.receive(state);
    handlers.get('pointerdown')({x:920,y:400}); assert.equal(scene.cameraMode,'manual');
    const first=scene.manualY; handlers.get('pointermove')({x:920,y:500,isDown:true});assert.ok(scene.manualY>first);
    handlers.get('pointerup')();assert.equal(scene.mapDragging,false);
    handlers.get('pointerdown')({x:300,y:350,worldX:300,worldY:1800});assert.equal(scene.heldBall,'viewer');
    scene.update(200,16);assert.ok(scene.cameraLabel.text.includes('누르는 동안 추적 · 테스트공'));
    handlers.get('pointerup')();assert.equal(scene.heldBall,null);
    scene.followLeader();scene.update(400,16);assert.equal(scene.cameraMode,'leader');assert.ok(scene.cameraLabel.text.includes('선두 자동 추적'));
    const pool=scene.avatarTextures; lifecycle.get('destroy')();
    assert.equal(pool.destroyed,true); assert.equal(scene.controller,null); assert.equal(scene.actors.size,0);
});
