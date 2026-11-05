import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import HistoryDatabase, { validateHistoryLimit } from '../src/server/history/HistoryDatabase.js';
import ChatHistoryStore from '../src/server/history/ChatHistoryStore.js';
import { normalizeHistoryMessage } from '../src/server/history/normalizeHistoryMessage.js';
import { createHistoryHandler } from '../src/server/history/historyApi.js';

const resources = new WeakMap();
function temporary(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yobot-history-test-'));
    t.after(() => {
        for (const db of resources.get(t) || []) db.close();
        if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('yobot-history-test-')) throw new Error('Unsafe test cleanup path');
        fs.rmSync(directory, { recursive: true, force: true });
    });
    return path.join(directory, 'history.sqlite');
}
function entry(index, userId = 'alice', platform = 'soop') {
    return { platform, userId, nickname: `별명${index}`, content: `채팅 ${index}`, receivedAt: index,
        channelId: 'channel-a', sourceId: null, kind: 'text', metadata: {} };
}
function open(t, filePath, capacity) {
    const db = new HistoryDatabase(filePath, capacity);
    [...db.resizeUsers()];
    if (!resources.has(t)) resources.set(t, []);
    resources.get(t).push(db);
    return db;
}

test('limit defaults to 9999; invalid config values are rejected', () => {
    assert.equal(validateHistoryLimit(), 9999);
    for (const value of [0, -1, 10000, 1.5, '999', null, NaN]) assert.throws(() => validateHistoryLimit(value));
    for (const value of [1, 999, 9999]) assert.equal(validateHistoryLimit(value), value);
});

test('platform identity, nickname changes and no token persistence', () => {
    const message = normalizeHistoryMessage({ messageType: 'chzzk', uid: 'fallback',
        profile: JSON.stringify({ userIdHash: 'stable', nickname: '첫별명', accessToken: 'SECRET' }),
        extras: JSON.stringify({ extraToken: 'SECRET', emojis: { good: 'https://cdn.example/a.webp', bad: 'javascript:bad' } }), msg: '안녕' });
    assert.equal(message.userId, 'stable');
    assert.equal(message.nickname, '첫별명');
    assert(!JSON.stringify(message).includes('SECRET'));
    assert.deepEqual(message.metadata.emojis, { good: 'https://cdn.example/a.webp' });
    assert.equal(normalizeHistoryMessage({ messageType: 'pong' }), null);
    assert.equal(normalizeHistoryMessage({ messageType: 'twitch', userId: 'mutablelogin', content: 'hi' }), null);
    assert.equal(normalizeHistoryMessage({ messageType: 'twitch', userId: '123', nickname: '변경별명', content: 'hi' }).userId, '123');
    assert.equal(normalizeHistoryMessage({ messageType: 'soop', userId: '', content: 'hi' }), null);
    assert.equal(normalizeHistoryMessage({ messageType: 'chzzk', profile: 'null', extras: 'null', msg: 'hi' }), null);
});

test('999 ring slots keep newest records, without DELETE or COUNT on ingestion', t => {
    const db = open(t, temporary(t), 999);
    db.appendBatch(Array.from({ length: 1500 }, (_, i) => entry(i + 1)));
    const first = db.query({ platform: 'soop', userId: 'alice', limit: 100 });
    assert.equal(first.total, 999);
    assert.equal(first.messages[0].content, '채팅 1500');
    assert.equal(first.messages[99].content, '채팅 1401');
    assert.equal(first.nickname, '별명1500');
    assert.equal(db.db.prepare('SELECT MIN(seq) AS n FROM history_messages').get().n, 502);
    const source = fs.readFileSync(new URL('../src/server/history/HistoryDatabase.js', import.meta.url), 'utf8');
    const ingest = source.split('    appendBatch(messages) {')[1].split('    query(')[0];
    assert(!/DELETE|COUNT\(|\.shift\(/.test(ingest));
});

test('cursor pagination is newest-first, complete and has no duplicate boundary rows', t => {
    const db = open(t, temporary(t), 999);
    db.appendBatch(Array.from({ length: 999 }, (_, i) => entry(i + 1)));
    const sequences = [];
    let before;
    do {
        const page = db.query({ platform: 'soop', userId: 'alice', ...(before && { before }), limit: 100 });
        sequences.push(...page.messages.map(message => message.sequence));
        before = page.nextCursor;
    } while (before);
    assert.deepEqual(sequences, Array.from({ length: 999 }, (_, i) => 999 - i));
    db.appendBatch([entry(1000)]);
    const next = db.query({ platform: 'soop', userId: 'alice', before: 900 });
    assert.equal(next.messages[0].sequence, 899);
});

test('identical IDs on separate platforms are isolated; original IDs deduplicate per channel', t => {
    const db = open(t, temporary(t), 3);
    const message = { ...entry(1), sourceId: 'original-id' };
    db.appendBatch([message, message, { ...message, channelId: 'channel-b' }, entry(2, 'alice', 'chzzk'), entry(3, 'bob')]);
    assert.equal(db.query({ platform: 'soop', userId: 'alice' }).total, 2);
    assert.equal(db.query({ platform: 'chzzk', userId: 'alice' }).total, 1);
    assert.equal(db.query({ platform: 'soop', userId: 'bob' }).total, 1);
});

test('restart and resizing preserve newest records and sequence continuity', t => {
    const file = temporary(t);
    let db = new HistoryDatabase(file, 9);
    db.appendBatch(Array.from({ length: 15 }, (_, i) => entry(i + 1)));
    db.close();
    db = new HistoryDatabase(file, 3);
    assert.equal([...db.resizeUsers()].length, 1);
    assert.deepEqual(db.query({ platform: 'soop', userId: 'alice' }).messages.map(message => message.sequence), [15, 14, 13]);
    db.appendBatch([entry(16)]);
    db.close();
    db = new HistoryDatabase(file, 5);
    [...db.resizeUsers()];
    db.appendBatch([entry(17), entry(18), entry(19)]);
    assert.deepEqual(db.query({ platform: 'soop', userId: 'alice' }).messages.map(message => message.sequence), [19, 18, 17, 16, 15]);
    assert.equal([...db.resizeUsers()].length, 0);
    db.close();
});

test('capacity 1 always exposes only the most recently received message', t => {
    const db = open(t, temporary(t), 1);
    db.appendBatch([entry(1), entry(2), entry(3)]);
    const page = db.query({ platform: 'soop', userId: 'alice' });
    assert.equal(page.total, 1);
    assert.equal(page.messages[0].sequence, 3);
    assert.equal(page.nextCursor, null);
});

test('batch transaction rolls back both slot updates and metadata on failure', t => {
    const db = open(t, temporary(t), 3);
    db.appendBatch([entry(1)]);
    const invalid = entry(3); invalid.content = 1n;
    assert.throws(() => db.appendBatch([entry(2), invalid]));
    assert.equal(db.query({ platform: 'soop', userId: 'alice' }).total, 1);
    db.appendBatch([entry(4)]);
    assert.equal(db.query({ platform: 'soop', userId: 'alice' }).messages[0].sequence, 2);
});

test('worker flush includes just-received chat and persists across restarts', async t => {
    const filePath = temporary(t);
    let store = new ChatHistoryStore({ filePath, limit: 3, channels: { soop: '방송A' } });
    await store.ready;
    store.record({ messageType: 'soop', userId: 'alice', nickname: '이전닉', content: '첫 채팅' });
    store.record({ messageType: 'soop', userId: 'alice', nickname: '새닉', content: '최신 채팅' });
    assert.equal((await store.query({ platform: 'soop', userId: 'alice' })).messages[0].content, '최신 채팅');
    store.record({ messageType: 'soop', userId: 'alice', content: '종료 직전' });
    await store.close();
    store = new ChatHistoryStore({ filePath, limit: 1 });
    await store.ready;
    const page = await store.query({ platform: 'soop', userId: 'alice' });
    assert.equal(page.total, 1);
    assert.equal(page.messages[0].content, '종료 직전');
    await store.close();
    await assert.rejects(store.query({ platform: 'soop', userId: 'alice' }));
});

test('worker handles burst, ring cap, concurrent queries, and bounded batches', async t => {
    const store = new ChatHistoryStore({ filePath: temporary(t), limit: 999 });
    await store.ready;
    for (let i = 0; i < 4000; i++) store.record({ messageType: 'soop', userId: 'alice', content: `기록${i}` });
    const pages = await Promise.all(Array.from({ length: 4 }, () => store.query({ platform: 'soop', userId: 'alice' })));
    for (const page of pages) { assert.equal(page.total, 999); assert.equal(page.messages[0].content, '기록3999'); }
    await store.close();
});

test('API validates input, enforces local access, caps pages and returns storage failure', async () => {
    function response() { return { code: 200, headers: {}, set(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; } }; }
    const calls = [];
    const handler = createHistoryHandler({ async query(options) { calls.push(options); return { messages: [] }; } });
    for (const query of [{ platform: 'bad', userId: 'a' }, { platform: 'soop', userId: ['a'] }, { platform: 'soop', userId: 'a', before: '-1' }, { platform: 'soop', userId: 'a', before: '9007199254740992' }]) {
        const res = response(); await handler({ query }, res); assert.equal(res.code, 400);
    }
    const remote = response();
    await handler({ query: { platform: 'soop', userId: 'a' }, socket: { remoteAddress: '192.168.1.2' } }, remote);
    assert.equal(remote.code, 403);
    const res = response();
    await handler({ query: { platform: 'soop', userId: 'a', before: '123', limit: '999999' } }, res);
    assert.deepEqual(calls[0], { platform: 'soop', userId: 'a', before: 123, limit: 100 });
    assert.equal(res.headers['Cache-Control'], 'no-store');
    const failed = response();
    await createHistoryHandler({ query: async () => { throw new Error('disk failure'); } })({ query: { platform: 'soop', userId: 'a' } }, failed);
    assert.equal(failed.code, 503);
});

test('manager notes survive restart and chat retention, in order and per platform/account', t => {
    const file = temporary(t);
    const account = { platform: 'soop', userId: 'alice' };
    const db = open(t, file, 1);
    const first = db.addNote({ ...account, content: '첫 댓글' });
    const second = db.addNote({ ...account, content: '두 번째 댓글' });
    db.appendBatch([entry(1), entry(2)]);
    const reopened = open(t, file, 9999);
    assert.deepEqual(reopened.notes(account).map(note => ({ ...note })), [first, second]);
    assert.deepEqual(reopened.notes({ ...account, platform: 'twitch' }), []);
    assert.deepEqual(reopened.notes({ ...account, userId: 'bob' }), []);
    assert.equal(reopened.query(account).total, 1);
});

test('migrate the old default once while preserving the rest of config.js', async t => {
    const { migrateHistoryLimit } = await import('../src/server/history/migrateHistoryLimit.js');
    const root = path.dirname(temporary(t));
    const file = path.join(root, 'config.js');
    const source = 'const config = { "CHAT_HISTORY": { "MAX_MESSAGES_PER_USER": 999 }, "CHANNEL_ID": "keep" };';
    fs.writeFileSync(file, source);
    assert.equal(await migrateHistoryLimit(root, 999), 9999);
    assert.equal(fs.readFileSync(file, 'utf8'), source.replace('999', '9999'));
    fs.writeFileSync(file, source);
    assert.equal(await migrateHistoryLimit(root, 999), 999);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
});

test('leave a customized history limit untouched on first start', async t => {
    const { migrateHistoryLimit } = await import('../src/server/history/migrateHistoryLimit.js');
    const root = path.dirname(temporary(t));
    const file = path.join(root, 'config.js');
    const source = 'const config = { CHAT_HISTORY: { MAX_MESSAGES_PER_USER: 2500 } };';
    fs.writeFileSync(file, source);
    assert.equal(await migrateHistoryLimit(root, 2500), 2500);
    assert.equal(fs.readFileSync(file, 'utf8'), source);
});

test('exclude configured display names from new records on all platforms', async t => {
    const filePath = temporary(t);
    const chzzk = { messageType: 'chzzk', profile: { userIdHash: 'bot', nickname: ' 빵떡 ' }, msg: '치지직' };
    const soop = { messageType: 'soop', userId: 'streamer', nickname: '지니주디', content: '숲' };
    const twitch = { messageType: 'twitch', userId: '123', nickname: '빵떡', content: '트위치' };
    const accounts = [
        { platform: 'chzzk', userId: 'bot' },
        { platform: 'soop', userId: 'streamer' },
        { platform: 'twitch', userId: '123' }
    ];
    const store = new ChatHistoryStore({ filePath });
    try {
        for (const message of [chzzk, soop, twitch]) assert.equal(store.record(message), null);
        assert(store.record({ ...twitch, nickname: '빵떡친구' }));
        const pages = await Promise.all(accounts.map(account => store.query(account)));
        assert.deepEqual(pages.map(page => page.total), [0, 0, 1]);
    } finally {
        await store.close();
    }

    const custom = new ChatHistoryStore({ filePath, excludedNicknames: ['빵떡친구'] });
    try {
        assert.equal(custom.record({ ...twitch, nickname: '빵떡친구' }), null);
        assert(custom.record(twitch));
        assert.equal((await custom.query(accounts[2])).total, 2);
    } finally {
        await custom.close();
    }
});
