import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('game menu starts no game engine and switching tears down previous session', async () => {
    const source = fs.readFileSync(new URL('../src/client/game/GameMenuController.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default class GameMenuController', 'class GameMenuController');
    const nodes = new Map();
    const get = id => { if (!nodes.has(id)) nodes.set(id, { addEventListener() {} }); return nodes.get(id); };
    const instances = []; const classes = new Set();
    class Game { constructor(type) { this.type = type; instances.push(this); } async init() {} destroy() { this.destroyed = true; } }
    const Menu = vm.runInNewContext(source + ';GameMenuController', { GameController: Game, AbortController, document: { getElementById: get, querySelectorAll: () => [], body: { classList: { add: name => classes.add(name), remove: (...names) => names.forEach(n => classes.delete(n)) } } } });
    const menu = new Menu(); await menu.init(); assert.equal(instances.length, 0); assert.equal(get('game-menu').hidden, false);
    await menu.select('marble'); assert.equal(instances[0].type, 'marble');
    await menu.select('pepero'); assert.equal(instances.length, 1);
    menu.back(); assert.equal(instances[0].destroyed, true); assert.ok(classes.has('game-mode'));
    await menu.select('pepero'); assert.equal(instances[1].type, 'pepero');
    menu.destroy(); assert.equal(instances[1].destroyed, true); assert.equal(classes.size, 0);
    await menu.select('marble'); assert.equal(instances.length, 2);
});
