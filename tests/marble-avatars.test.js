import test from 'node:test';
import assert from 'node:assert/strict';
import AvatarStore, { allowedAvatarUrl, avatarForMessage } from '../src/server/game/AvatarStore.js';
import AvatarTextures from '../src/client/game/AvatarTextures.js';

test('avatar lookup uses official profile hosts and anonymous Twitch falls back', () => {
    assert.equal(allowedAvatarUrl('http://127.0.0.1/a.png'), '');
    assert.equal(allowedAvatarUrl('https://phinf.pstatic.net.evil.test/a.png'), '');
    assert.equal(allowedAvatarUrl('https://user:pass@phinf.pstatic.net/a.png'), '');
    const url='https://phinf.pstatic.net/profile.png';
    assert.equal(avatarForMessage({ profile: JSON.stringify({ profileImageUrl:url }) }, {platform:'chzzk',userId:'hash'}),url);
    assert.equal(avatarForMessage({}, {platform:'soop',userId:'kimjudy'}),'https://profile.img.sooplive.co.kr/LOGO/ki/kimjudy/kimjudy.jpg');
    assert.equal(avatarForMessage({}, {platform:'twitch',userId:'123'}),'');
});
test('server deduplicates avatar downloads, caches failures and frees buffers on destroy', async () => {
    let calls=0;
    const store=new AvatarStore({fetchImage:async()=>{calls++;await Promise.resolve();return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});}});
    const url='https://profile.img.sooplive.co.kr/a.png';
    const [a,b]=await Promise.all([store.get(url),store.get(url)]);
    assert.equal(calls,1);assert.equal(a,b);assert.equal(a.data.length,3);
    await store.get(url);assert.equal(calls,1);store.destroy();assert.equal(store.bytes,0);assert.equal(store.cache.size,0);
    assert.equal(await store.get(url),null);
    let misses=0;const missing=new AvatarStore({fetchImage:async()=>{misses++;return new Response('missing',{status:404});}});
    assert.equal(await missing.get(url),null);assert.equal(await missing.get(url),null);assert.equal(misses,1);missing.destroy();
});
function fixture(overrides={}) {
    const textures=new Map();const stats={downloads:0,decodes:0,draws:0,closed:0,removed:0};
    const ctx={save(){},beginPath(){},arc(){},clip(){},restore(){},stroke(){},drawImage(){stats.draws++;}};
    const scene={textures:{createCanvas:key=>{const texture={getContext:()=>ctx,refresh(){}};textures.set(key,texture);return texture;},exists:key=>textures.has(key),remove:key=>{textures.delete(key);stats.removed++;}}};
    const pool=new AvatarTextures(scene,{fetchImage:async()=>{stats.downloads++;return new Response(new Uint8Array([1]),{headers:{'content-type':'image/png'}});},
        decodeImage:async()=>{stats.decodes++;return{width:96,height:64,close(){stats.closed++;}};},...overrides});
    return{pool,stats,textures};
}
const person={key:'soop:viewer',platform:'soop',userId:'viewer',avatarUrl:'https://profile.img.sooplive.co.kr/a.png'};
test('avatar becomes a circular 64px texture once and is shared until game exit', async () => {
    const {pool,stats,textures}=fixture();
    const [a,b]=await Promise.all([pool.get(person),pool.get(person)]);assert.equal(a,b);
    await pool.get(person);assert.equal(stats.downloads,1);assert.equal(stats.decodes,1);assert.equal(stats.draws,1);assert.equal(stats.closed,1);
    assert.equal(textures.size,1);pool.destroy();assert.equal(textures.size,0);assert.equal(stats.removed,1);
});
test('missing avatar or failed decode leaves the original colored marble', async () => {
    const {pool,stats}=fixture({decodeImage:async()=>{throw Error('unsupported');}});
    assert.equal(await pool.get({...person,avatarUrl:''}),null);assert.equal(stats.downloads,0);
    assert.equal(await pool.get(person),null);assert.equal(await pool.get(person),null);assert.equal(stats.downloads,1);pool.destroy();
});
test('leaving during avatar download aborts it and creates no late texture', async () => {
    let aborted=false;const {pool,textures}=fixture({fetchImage:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));}))});
    const pending=pool.get(person);pool.destroy();assert.equal(await pending,null);assert.equal(aborted,true);assert.equal(textures.size,0);
});


test('ordinary multi-megabyte profile JPEGs fit the bounded eight-megabyte server cache', async () => {
    const store=new AvatarStore({fetchImage:async()=>new Response(new Uint8Array(2*1024*1024),{headers:{'content-type':'image/jpeg'}})});
    for(let i=0;i<5;i++) assert.ok(await store.get('https://profile.img.sooplive.co.kr/'+i+'.jpg'));
    assert.ok(store.bytes<=8*1024*1024);assert.ok(store.cache.size<=4);store.destroy();assert.equal(store.bytes,0);
});
