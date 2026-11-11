import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../src/client/chat/ChatMemoController.js', import.meta.url), 'utf8')
    .replace(/^import config .*;\r?\n/, '');
const { default: ChatMemoController } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('memo UI reports confirmed upload and ignores an obsolete backup response', async t => {
    const status = { textContent: '', style: {} };
    t.mock.method(globalThis, 'fetch', async () => ({
        ok: true, json: async () => ({ enabled: true, completedRevision: 3 })
    }));
    const oldDocument = globalThis.document;
    globalThis.document = { getElementById: () => status };
    t.after(() => { globalThis.document = oldDocument; });
    const controller = new ChatMemoController();
    controller.memoBackupRevision = 3;
    await controller.checkMemoBackup(3);
    assert.equal(status.textContent, '로컬 저장 및 Gist 업로드 완료');

    let finish;
    globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
    const checking = controller.checkMemoBackup(3);
    controller.memoBackupRevision = 4;
    status.textContent = '새 메모 예약 중';
    finish({ ok: true, json: async () => ({ enabled: true, completedRevision: 3 }) });
    await checking;
    assert.equal(status.textContent, '새 메모 예약 중');
    controller.destroy();
});

test('!게임모드 invokes the mode switch without storing a memo or invoking broadcast commands', async t => {
    const input = { value: '  !게임모드  ' };
    const status = { textContent: '이전 상태', style: {} };
    const previous = globalThis.document;
    globalThis.document = { getElementById: id => ({ 'memo-input': input, 'memo-status': status, broad_time: { textContent: '00:00:00' } })[id] };
    t.after(() => { globalThis.document = previous; });
    let entries = 0;
    const controller = new ChatMemoController({ onGameMode: () => entries++ });
    controller.processCommand = () => assert.fail('The game command must be handled locally first');
    t.mock.method(globalThis, 'fetch', () => assert.fail('The game command must not be uploaded'));
    await controller.saveMemo();
    assert.equal(entries, 1);
    assert.equal(input.value, '');
    assert.equal(status.textContent, '');
});
