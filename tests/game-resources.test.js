import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/client/game/GameController.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export default class GameController', 'class GameController')
    .replace("await import('./scenes/game/PeperoScene.js')", 'await loadScene()');

function environment() {
    const calls = { scripts: 0, engines: 0, sockets: 0, engineDestroyed: 0, audioClosed: 0, sent: [] };
    let script;
    const classes = new Set();
    const document = {
        body: { classList: { add: name => classes.add(name), remove: (...names) => names.forEach(name => classes.delete(name)), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } },
        createElement: () => ({}),
        head: { append: node => { script = node; calls.scripts++; } },
        getElementById: () => ({ addEventListener() {}, setAttribute() {}, toggleAttribute() {} }),
        querySelectorAll: () => ['pause', 'next', 'launch', 'start', 'reset'].map(action => ({ dataset: { gameAction: action }, addEventListener() {} }))
    };
    class Socket {
        static OPEN = 1;
        constructor() { calls.sockets++; this.readyState = 1; }
        send(value) { calls.sent.push(JSON.parse(value)); }
        close(code) { this.readyState = 3; this.onclose?.({ code }); }
    }
    const Phaser = {
        AUTO: 0, Scale: { FIT: 0, CENTER_BOTH: 0 },
        Game: class { constructor() { calls.engines++; } destroy() { calls.engineDestroyed++; } }
    };
    const window = {};
    const context = vm.createContext({ document, window, Phaser, WebSocket: Socket, AbortController,
        config: { PORT: { CHAT_DISPLAY: 1234 } }, setTimeout, clearTimeout,
        loadScene: async () => ({ default: class {} }) });
    const Controller = vm.runInContext(source + '; GameController;', context);
    return { Controller, calls, window, Phaser, classes, loaded() { window.Phaser = Phaser; script.onload(); } };
}

test('default mode allocates no engine, socket or engine download; exiting during loading cancels initialization', async () => {
    const env = environment();
    const controller = new env.Controller();
    assert.equal(env.calls.scripts, 0);
    assert.equal(env.calls.engines, 0);
    assert.equal(env.calls.sockets, 0);
    const ready = controller.init();
    assert.equal(env.calls.scripts, 1);
    controller.destroy();
    env.loaded();
    await ready;
    assert.equal(env.calls.engines, 0);
    assert.equal(env.calls.sockets, 0);
    assert.equal(env.classes.size, 0);
});

test('leaving game mode closes game socket and audio, destroys Phaser and aborts input listeners once', async () => {
    const env = environment();
    env.window.Phaser = env.Phaser;
    const controller = new env.Controller();
    await controller.init();
    controller.canControl = true;
    controller.audio = { close() { env.calls.audioClosed++; } };
    const socket = controller.socket;
    controller.retry = setTimeout(() => assert.fail('reconnect survived game exit'), 50);
    controller.destroy();
    controller.destroy();
    assert.equal(env.calls.engines, 1);
    assert.equal(env.calls.sockets, 1);
    assert.equal(env.calls.engineDestroyed, 1);
    assert.equal(env.calls.audioClosed, 1);
    assert.equal(env.calls.sent[0].action, 'leave');
    assert.equal(controller.events.signal.aborted, true);
    assert.equal(controller.game, null);
    assert.equal(controller.socket, null);
    assert.equal(controller.audio, null);
    assert.equal(socket.readyState, 3);
    assert.equal(env.classes.size, 0);
    await new Promise(resolve => setTimeout(resolve, 70));
});
