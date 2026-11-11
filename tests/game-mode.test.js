import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('chat is the default and repeated game entry/exit releases each game instance', async () => {
    const source = fs.readFileSync(new URL('../src/client/app.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
    const instances = [];
    const exits = [];
    let enter;
    let memoFocused = 0;
    let chats = 0;
    class Game {
        constructor() { instances.push(this); this.actions = []; }
        init() { this.initialized = true; }
        action(action) { this.actions.push(action); }
        destroy() { this.destroyed = true; }
    }
    class Chat {
        constructor() { chats++; }
        async init() {}
    }
    class Memo {
        constructor({ onGameMode }) { enter = onGameMode; }
        init() {}
    }
    const document = {
        getElementById: id => id === 'game-exit'
            ? { addEventListener: (_name, handler) => exits.push(handler) }
            : { focus: () => memoFocused++ }
    };
    const context = vm.createContext({
        GameController: Game, ChatDisplay: Chat, ChatMemoController: Memo, document,
        console, window: { addEventListener() {} }
    });
    await vm.runInContext('(async () => {' + source + '\n})()', context);
    assert.equal(instances.length, 0);
    assert.equal(chats, 1);
    for (let i = 0; i < 3; i++) {
        await enter();
        await enter();
        assert.equal(instances.length, i + 1);
        assert.equal(instances[i].initialized, true);
        exits[0]();
        assert.deepEqual(instances[i].actions, []);
        assert.equal(instances[i].destroyed, true);
    }
    assert.equal(memoFocused, 3);
    assert.equal(chats, 1);
    assert.equal(exits.length, 1);
});
