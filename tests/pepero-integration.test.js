import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import config from '../config.js';
import ChatHub from '../src/server/chat/ChatHub.js';

test('game socket receives live chat participants and only its host can control the game', async t => {
    const originalPort = config.PORT.CHAT_DISPLAY;
    config.PORT.CHAT_DISPLAY = 0;
    const hub = new ChatHub();
    const sockets = [];
    t.after(async () => {
        for (const socket of sockets) socket.terminate();
        hub.destroy();
        config.PORT.CHAT_DISPLAY = originalPort;
    });
    assert.equal(hub.game, null);
    await hub.createWebSocketDisplay();
    assert.equal(hub.game, null);
    const url = 'ws://127.0.0.1:' + hub.wss.address().port + '/?game=pepero';
    const connect = async () => {
        const socket = new WebSocket(url);
        sockets.push(socket);
        const messages = [];
        socket.on('message', data => messages.push(JSON.parse(data)));
        await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
        return { socket, messages };
    };
    const until = async check => {
        for (let i = 0; i < 100; i++) {
            if (check()) return;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.fail('Game socket state was not delivered');
    };
    const host = await connect();
    const spectator = await connect();
    await until(() => host.messages.length && spectator.messages.length);
    assert.equal(hub.game.timer, null);
    assert.equal(host.messages.at(-1).canControl, true);
    assert.equal(spectator.messages.at(-1).canControl, false);
    spectator.socket.send(JSON.stringify({ messageType: 'pepero_action', action: 'start' }));
    host.socket.send(JSON.stringify({ messageType: 'ping' }));
    await until(() => host.messages.some(message => message.messageType === 'pong'));
    assert.equal(hub.game.state.phase, 'idle');

    host.socket.send(JSON.stringify({ messageType: 'pepero_action', action: 'start' }));
    await until(() => hub.game.state.phase === 'recruiting');
    for (let i = 0; i < 10; i++) {
        const message = { messageType: 'soop', userId: 'viewer-' + i, nickname: '테스트' + i, content: '!위' };
        hub.broadcast(message);
        hub.broadcast(message);
    }
    host.socket.send(JSON.stringify({ messageType: 'pepero_action', action: 'launch' }));
    await until(() => spectator.messages.at(-1)?.state?.phase === 'attacking');
    const attack = spectator.messages.at(-1).state.attacks;
    assert.equal(attack.length, 10);
    assert.equal(attack.filter(person => person.isNpc).length, 0);
    assert.equal(new Set(attack.map(person => person.key)).size, 10);
    host.socket.close();
    await until(() => hub.game.state.paused);
    const replacement = await connect();
    await until(() => replacement.messages.at(-1)?.canControl);
    assert.equal(replacement.messages.at(-1).state.paused, true);
    assert.equal(replacement.messages.at(-1).state.attacks.length, 10);
    const previousGame = hub.game;
    replacement.socket.send(JSON.stringify({ messageType: 'pepero_action', action: 'leave' }));
    await until(() => hub.game === null);
    assert.equal(previousGame.timer, null);
    assert.equal(previousGame.entrants.size, 0);
    await until(() => spectator.socket.readyState === WebSocket.CLOSED);
    const fresh = await connect();
    await until(() => fresh.messages.at(-1)?.canControl);
    assert.notEqual(hub.game, previousGame);
    fresh.socket.close();
    await until(() => hub.game === null);
});
