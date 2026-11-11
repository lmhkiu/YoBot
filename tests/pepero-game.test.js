import test from 'node:test';
import assert from 'node:assert/strict';
import PeperoGame from '../src/server/game/PeperoGame.js';

function participant(index, platform = 'soop', nickname = '시청자' + index) {
    const message = { messageType: platform, userId: String(index + 1), nickname, content: '참가할게요' };
    if (platform === 'chzzk') {
        message.profile = JSON.stringify({ userIdHash: String(index + 1), nickname });
        message.msg = message.content;
    }
    return message;
}

function setup(t) {
    let now = 100000;
    const game = new PeperoGame({ now: () => now, random: () => 0.5, excludedNicknames: ['빵떡'] });
    t.after(() => game.destroy());
    game.start();
    return { game, advance(ms) { now += ms; game.tick(); } };
}

for (const count of [0, 1, 7, 10, 15, 500]) {
    test(count + ' viewers occupy unique slots before any NPC is used', t => {
        const { game } = setup(t);
        for (let i = 0; i < count; i++) {
            const platform = ['soop', 'chzzk', 'twitch'][i % 3];
            game.acceptChat(participant(i, platform));
            game.acceptChat(participant(i, platform));
        }
        game.launch();
        const attacks = game.snapshot().attacks;
        assert.equal(attacks.length, 10);
        const people = attacks.filter(attack => !attack.isNpc);
        assert.equal(people.length, Math.min(count, 10));
        assert.equal(new Set(people.map(person => person.key)).size, people.length);
        for (const npc of attacks.filter(attack => attack.isNpc)) {
            assert.equal(npc.userId, null);
            assert.equal(npc.platform, 'npc');
            assert(npc.key.startsWith('npc:'));
            assert(!npc.nickname.startsWith('시청자'));
        }
    });
}

test('a display name change and lane command update the same account, while separate platforms remain distinct', t => {
    const { game } = setup(t);
    game.acceptChat(participant(0, 'chzzk', '첫이름'));
    const renamed = participant(0, 'chzzk', '다른이름');
    renamed.msg = '!아래';
    game.acceptChat(renamed);
    game.acceptChat(participant(0, 'soop'));
    game.acceptChat(participant(100, 'soop', '빵떡'));
    assert.equal(game.entrants.size, 2);
    game.launch();
    assert.equal(game.state.attacks.find(attack => attack.platform === 'chzzk').nickname, '다른이름');
    assert.equal(game.state.attacks.find(attack => attack.platform === 'chzzk').lane, 2);
});

test('recruitment closes on its deadline and pause preserves the remaining time', t => {
    const { game, advance } = setup(t);
    game.acceptChat(participant(1));
    advance(14000);
    game.pause();
    advance(20000);
    assert.equal(game.state.phase, 'recruiting');
    game.resume();
    advance(999);
    assert.equal(game.state.phase, 'recruiting');
    advance(1);
    assert.equal(game.state.phase, 'attacking');
    game.acceptChat(participant(2));
    assert.equal(game.state.attacks.filter(attack => !attack.isNpc).length, 1);
});

test('shield hits are resolved once and reconnect pause does not consume attacks', t => {
    const { game, advance } = setup(t);
    game.acceptChat(participant(1));
    game.launch();
    const first = game.state.attacks[0];
    game.move(first.lane);
    game.pause();
    advance(60000);
    assert.equal(first.outcome, null);
    game.resume();
    advance(first.impactAt - game.now());
    assert.equal(first.outcome, 'blocked');
    const blocked = game.state.blocked;
    game.tick();
    assert.equal(game.state.blocked, blocked);
    game.action('reset');
    assert.equal(game.state.phase, 'idle');
    assert.equal(game.state.health, 10);
});

test('all viewer hits produce a viewer win, without attributing NPC points to viewers', t => {
    const { game, advance } = setup(t);
    for (let i = 0; i < 10; i++) {
        const message = participant(i);
        message.content = '!아래';
        game.acceptChat(message);
    }
    game.launch();
    game.move(0);
    advance(20000);
    assert.equal(game.state.health, 0);
    assert.equal(game.state.winner, 'viewers');
    assert.equal(game.snapshot().scores.reduce((sum, score) => sum + score.hits, 0), 10);
});


test('game timer runs only during active recruitment or attacks', t => {
    const game = new PeperoGame();
    t.after(() => game.destroy());
    assert.equal(game.timer, null);
    game.start();
    assert.ok(game.timer);
    game.pause();
    assert.equal(game.timer, null);
    game.resume();
    assert.ok(game.timer);
    game.reset();
    assert.equal(game.timer, null);
    game.start();
    game.launch();
    for (const attack of game.state.attacks) attack.impactAt = 0;
    game.tick();
    assert.ok(['between', 'finished'].includes(game.state.phase));
    assert.equal(game.timer, null);
    game.destroy();
    assert.equal(game.timer, null);
});
