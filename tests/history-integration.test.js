import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('ChatHub records original receive once, does not record browser replay, and only notifies relevant history windows', () => {
    const source = fs.readFileSync(new URL('../src/server/chat/ChatHub.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export default class ChatHub', 'class ChatHub');
    const recorded = [];
    const config = { CHAT_DISPLAY: { MESSAGE_BUFFER_DURATION: 300000 } };
    const Hub = vm.runInNewContext(source + '\nChatHub', { config, console: { log() {} }, WebSocket: { OPEN: 1 }, PeperoGame: class { acceptChat() {} destroy() {} } });
    const hub = new Hub({ record(message) { recorded.push(message); return { platform: 'twitch', userId: '123' }; } });
    const client = historyUser => ({ readyState: 1, historyUser, received: [], send(value) { this.received.push(JSON.parse(value)); } });
    const main = client(null), mine = client({ platform: 'twitch', userId: '123' }), other = client({ platform: 'soop', userId: '123' });
    hub.clients.push(main, mine, other);
    hub.broadcast({ messageType: 'twitch', userId: '123', messageId: 'upstream-id', content: 'hello' });
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].messageId, 'upstream-id');
    assert.equal(main.received[0].historyUser.userId, '123');
    assert.equal(mine.received[0].messageType, 'history_changed');
    assert.equal(other.received.length, 0);
    hub.sendMissedMessages(main, 1);
    assert.equal(recorded.length, 1);
    assert.equal(main.received.length, 2);
});

test('nickname links encode platform/account ID and do not depend on the nickname', () => {
    const source = fs.readFileSync(new URL('../src/client/chat/ChatDisplay.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export default class ChatDisplay', 'class ChatDisplay');
    const Display = vm.runInNewContext(source + '\nChatDisplay', {});
    const display = new Display();
    const html = '<div class="chat-message-nickname" style="color: #749FFE">닉네임</div>';
    assert.equal(display.attachHistoryLink(html, {}), html);
    const linked = display.attachHistoryLink(html, { historyUser: { platform: 'soop', userId: 'id"<script>' } });
    assert(linked.includes('data-history-user="id%22%3Cscript%3E"'));
    assert(linked.includes('role="button" tabindex="0"'));
    assert(linked.includes('style="color: #749FFE"'));
});

test('nickname click reuses a user-specific window and keyboard activation works', () => {
    const source = fs.readFileSync(new URL('../src/client/chat/ChatDisplay.js', import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export default class ChatDisplay', 'class ChatDisplay');
    const handlers = {}, opened = [];
    const container = { addEventListener(name, callback) { handlers[name] = callback; } };
    const Display = vm.runInNewContext(source + '\nChatDisplay', {
        URLSearchParams, document: { getElementById: () => container },
        window: { open(...args) { opened.push(args); return { focus() {} }; } }
    });
    const display = new Display(); display.setHistoryClickListener();
    handlers.click({ target: { closest: () => ({ dataset: { historyPlatform: 'soop', historyUser: 'stable%20id' } }) } });
    handlers.click({ target: { closest: () => ({ dataset: { historyPlatform: 'soop', historyUser: 'stable%20id' } }) } });
    assert.equal(opened[0][0], '/history.html?platform=soop&userId=stable+id');
    assert.equal(opened[0][1], opened[1][1]);
    let clicked = false;
    handlers.keydown({ key: 'Enter', preventDefault() {}, target: { matches: () => true, click() { clicked = true; } } });
    assert(clicked);
});
