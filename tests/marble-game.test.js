import { corridorAt } from '../src/client/game/marbleTrack.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import MarbleGame, { TRACK } from '../src/server/game/MarbleGame.js';
function setup(t, count = 10) {
    let now = 10000; let seed = 117;
    const game = new MarbleGame({ now: () => now, random: () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646, excludedNicknames: ['빵떡'] });
    t.after(() => game.destroy()); game.start(Math.min(100, Math.max(10, count)));
    for (let i = 0; i < count; i++) game.acceptChat({ messageType: 'soop', userId: 'id-' + i, nickname: 'viewer' + i, content: '!참여' });
    return { game, advance(ms) { now += ms; game.tick(); } };
}
test('marble participation uses platform and stable ID, capped at 100, with no NPC fills', t => {
    const { game } = setup(t, 105);
    assert.equal(game.entrants.size, TRACK.maxPlayers);
    game.acceptChat({ messageType: 'soop', userId: 'id-0', nickname: 'new-name', content: '!참여' });
    assert.equal(game.entrants.get('soop:id-0').nickname, 'new-name');
    game.launch(); assert.equal(game.state.balls.length, 100);
    assert.equal(new Set(game.state.balls.map(b => b.key)).size, 100);
    assert.ok(game.state.balls.every(b => b.platform !== 'npc'));
});
test('same nickname and IDs across platforms remain distinct; bots excluded', t => {
    const { game } = setup(t, 0);
    for (const messageType of ['soop', 'twitch']) game.acceptChat({ messageType, userId: '123', nickname: 'same', content: '!참여' });
    game.acceptChat({ messageType: 'soop', userId: 'bot', nickname: '빵떡', content: '!참여' });
    assert.equal(game.entrants.size, 2); game.launch(); assert.equal(game.state.balls.length, 2);
});
test('empty recruitment keeps accepting viewers instead of starting fictitious balls', t => {
    const { game, advance } = setup(t, 0); advance(21000);
    assert.equal(game.state.phase, 'recruiting'); assert.equal(game.state.balls.length, 0);
    game.acceptChat({ messageType: 'soop', userId: 'late', nickname: 'late', content: '!참여' });
    game.launch(); assert.equal(game.state.phase, 'racing'); assert.equal(game.state.balls.length, 1);
});
test('pause freezes simulation and resume does not catch up paused time', t => {
    const { game, advance } = setup(t, 3); game.launch(); advance(100);
    game.pause(); const before = game.snapshot(); advance(10000);
    assert.equal(game.timer, null); assert.deepEqual(game.snapshot().balls, before.balls);
    game.resume(); advance(34); assert.ok(game.state.elapsed - before.elapsed < 0.1);
    game.reset(); assert.equal(game.timer, null); assert.equal(game.state.balls.length, 0);
});
test('bumper collision reflects velocity and spinner surface imparts motion', t => {
    const { game } = setup(t, 1);
    const ball = { x: 20, y: 0, vx: -100, vy: 0 };
    game.bounce(ball, 0, 0, 30, 1); assert.ok(ball.vx > 0); assert.equal(ball.x, 30);
    const spinner = { x: 0, y: -5, vx: 0, vy: 100 };
    game.bounce(spinner, 0, 0, 22, 0.72, 0, -100); assert.ok(spinner.vy < -100);
});
test('finishing order follows crossing time, not iteration order', t => {
    const { game } = setup(t, 2); game.launch();
    const [later, earlier] = game.state.balls;
    Object.assign(later, { x: 200, y: TRACK.finish - 2, vx: 0, vy: 300 });
    Object.assign(earlier, { x: 700, y: TRACK.finish - 1, vx: 0, vy: 300 });
    game.step(1 / 60);
    assert.equal(earlier.rank, 1); assert.equal(later.rank, 2); assert.equal(game.state.phase, 'finished'); assert.equal(game.timer, null);
});
for (const count of [1, 10, 100]) test(count + ' marbles produce finite trajectories, overtakes and an honest final result', t => {
    const { game } = setup(t, count); game.launch();
    const initial = [...game.state.balls].sort((a,b) => b.y-a.y).map(b => b.key).join();
    let overtook = false;
    for (let frame = 0; frame < 22000 && game.state.phase === 'racing'; frame++) {
        game.step(1 / 60);
        if (frame % 60 === 0) {
            const order = [...game.state.balls].sort((a,b) => b.y-a.y).map(b => b.key).join(); if (order !== initial) overtook = true;
            assert.ok(game.state.balls.every(b => [b.x,b.y,b.vx,b.vy].every(Number.isFinite)));
        }
    }
    assert.equal(game.state.phase, 'finished'); assert.equal(game.timer, null);
    assert.equal(game.state.results.length, count); assert.equal(new Set(game.state.results.map(b => b.key)).size, game.state.results.length);
    if(count > 1) assert.ok(overtook);
    console.log(count+' players: '+game.state.results.length+' finishers in '+game.state.elapsed.toFixed(1)+'s');
});


test('only explicit !참여 enters and streamer controls capacity with default ten', t => {
    const game = new MarbleGame(); t.after(() => game.destroy());
    game.start(); assert.equal(game.maxPlayers, 10); game.reset();
    game.action('start', 2);
    game.acceptChat({ messageType: 'soop', userId: 'ordinary', nickname: 'ordinary', content: '일반 채팅' });
    assert.equal(game.entrants.size, 0);
    for (let i = 0; i < 3; i++) game.acceptChat({ messageType: 'soop', userId: String(i), nickname: 'p'+i, content: ' !참여 ' });
    assert.equal(game.entrants.size, 2); assert.equal(game.snapshot().track.maxPlayers, 2);
    game.reset(); game.action('start', 0); assert.equal(game.state.phase, 'idle');
    game.action('start', 101); assert.equal(game.state.phase, 'idle');
});


test('enrollment never auto-starts on capacity or elapsed time; only host launch starts race', t => {
    const { game, advance } = setup(t, 3);
    assert.equal(game.timer, null);
    advance(600000); assert.equal(game.state.phase, 'recruiting'); assert.equal(game.state.balls.length, 0);
    game.acceptChat({ messageType: 'soop', userId: 'after-wait', nickname: '늦은참가자', content: '!참여' });
    assert.equal(game.entrants.size, 4);
    game.action('launch'); assert.equal(game.state.phase, 'racing'); assert.ok(game.timer);
});


test('우유함유 enters via either alias after the streamer opens recruitment', t => {
    const game=new MarbleGame();t.after(()=>game.destroy());
    const twitch={messageType:'twitch',userId:'479119137',nickname:'우유함유',content:'!참가'};
    game.acceptChat(twitch);assert.equal(game.entrants.size,0);
    game.start(5);game.acceptChat(twitch);
    assert.equal(game.entrants.get('twitch:479119137').nickname,'우유함유');
    game.acceptChat({...twitch,content:'!참여'});assert.equal(game.entrants.size,1);
    assert.equal(game.timer,null);game.launch();assert.equal(game.state.balls.length,1);
    game.acceptChat({...twitch,userId:'2',content:'!참가'});assert.equal(game.entrants.size,1);
    game.reset();game.start(5);game.acceptChat({...twitch,content:'!참여'});assert.equal(game.entrants.size,1);
});


test('long winding course includes rotating spiral, one-at-a-time funnel and jump pads', () => {
    assert.equal(TRACK.height,6200*3);assert.ok(Math.abs(corridorAt(2000).left-corridorAt(4000).left)>100);
    const game=new MarbleGame();const spiral=game.obstacles.find(o=>o.type==='spiral');
    assert.ok(spiral.speed);assert.equal(spiral.segments.length,96);
    assert.equal(corridorAt(17800).right-corridorAt(17800).left,50);
    assert.equal(game.obstacles.filter(o=>o.type==='jump').length,4);game.destroy();
});

test('jump pad throws a falling marble upward only once per pad', t => {
    const {game}=setup(t,1);game.launch();const pad=game.obstacles.find(o=>o.type==='jump');const ball=game.state.balls[0];
    Object.assign(ball,{x:pad.x,y:pad.y-2,vx:0,vy:200});game.step(1/60);assert.ok(ball.vy<0);assert.ok(ball.jumped.includes(pad.id));
    Object.assign(ball,{x:pad.x,y:pad.y-2,vx:0,vy:200});game.step(1/60);assert.ok(ball.vy>0);
});


test('observed 우유함유 Chzzk profile and stable hash register via both commands', t => {
    const game=new MarbleGame({excludedNicknames:['빵떡','지니주디']});t.after(()=>game.destroy());game.start();
    const id='50829cb1f5ec5f3a202481fca210717b';
    const message={messageType:'chzzk',uid:id,userId:id,profile:JSON.stringify({userIdHash:id,nickname:'우유함유'}),msg:'!참가'};
    game.acceptChat(message);game.acceptChat({...message,msg:'!참여'});
    assert.equal(game.entrants.size,1);assert.equal(game.entrants.get('chzzk:'+id).nickname,'우유함유');
});
