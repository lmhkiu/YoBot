import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import GistBackup from '../src/server/gist/GistBackup.js';

test('recovers older memos and merges missing entries without touching unrelated Gists', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yobot-gist-test-'));
    t.after(async () => {
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert(path.basename(directory).startsWith('yobot-gist-test-'));
        await fs.rm(directory, { recursive: true, force: true });
    });

    const shared = '00:01:00 공통 (20261102 10:00:00)';
    const remoteOnly = '00:02:00 다른 PC 메모 (20261102 10:01:00)';
    const localOnly = '00:03:00 여러 줄 메모\n두 번째 줄 (20261102 10:02:00)';
    const oldFile = 'memo_20261102.txt';
    const missingFile = 'memo_20261103.txt';
    await fs.writeFile(path.join(directory, oldFile), [shared, localOnly, shared].join('\r\n') + '\r\n');
    await fs.writeFile(path.join(directory, missingFile), '01:00:00 누락 파일 (20261103 11:00:00)\n');
    await fs.writeFile(path.join(directory, 'unrelated.txt'), '다른 파일');

    let remoteContent = shared + '\n' + remoteOnly + '\n';
    const writes = [];
    const getCalls = [];
    const backup = new GistBackup();
    backup.backupDir = directory;
    backup.getCommandList = async () => {};
    backup.memoApi = {
        async get(url) {
            getCalls.push(url);
            if (url === '/gists/old') {
                return { data: { public: false, files: { [oldFile]: { content: remoteContent } } } };
            }
            if (url.endsWith('page=2')) {
                return { data: [{ id: 'old', public: false, files: { [oldFile]: {} } }], headers: {} };
            }
            assert.equal(url, 'https://api.github.com/gists?per_page=100');
            return {
                data: [{ id: 'public', public: true, files: { [missingFile]: {} } }],
                headers: { link: '<https://api.github.com/gists?per_page=100&page=2>; rel="next"' }
            };
        },
        async patch(url, payload) {
            assert.equal(url, '/gists/old');
            remoteContent = payload.files[oldFile].content;
            writes.push({ url, payload });
        },
        async post(url, payload) {
            writes.push({ url, payload });
        }
    };

    await backup.init();
    await backup.destroy();
    assert.equal(remoteContent, [shared, remoteOnly, localOnly, shared].join('\n') + '\n');
    assert.deepEqual(writes.map(write => write.url), ['/gists/old', '/gists']);
    assert.equal(writes[1].payload.public, false);
    assert.deepEqual(Object.keys(writes[1].payload.files), [missingFile]);
    assert.equal(getCalls.filter(url => url.includes('per_page=100')).length, 2);

    // A restarted installation checks the cloud copy again without duplicating entries.
    backup.syncedMemos.clear();
    const get = backup.memoApi.get;
    backup.memoApi.get = async url => {
        if (url === '/gists/created') {
            return { data: { public: false, files: writes[1].payload.files } };
        }
        const response = await get(url);
        if (url.endsWith('page=2')) response.data.push({ id: 'created', public: false, files: { [missingFile]: {} } });
        return response;
    };
    await backup.destroy();
    assert.equal(writes.length, 2);

    // Saving another memo under a different broadcast date queues that actual file.
    const newFile = 'memo_20261104.txt';
    await fs.writeFile(path.join(directory, newFile), '00:01:00 새 메모 (20261104 09:00:00)\n');
    backup.backupMemo(60000);
    await backup.destroy();
    assert.deepEqual(Object.keys(writes.at(-1).payload.files), [newFile]);
});

test('upload exactly five seconds after the last saved memo and append to the existing date Gist', async t => {
    const { default: config } = await import('../config.js');
    assert.equal(config.UPDATE.BACKUP_INTERVAL, 5000);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yobot-gist-test-'));
    const backup = new GistBackup();
    backup.backupDir = directory;
    t.after(async () => {
        await backup.destroy();
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert(path.basename(directory).startsWith('yobot-gist-test-'));
        await fs.rm(directory, { recursive: true, force: true });
    });
    const name = 'memo_20261106.txt';
    const cloud = '기존 메모 (20261106 10:00:00)\n';
    const first = '첫 메모 (20261106 10:00:01)\n';
    const second = '다음 메모 (20261106 10:00:03)\n';
    let remote = cloud;
    let writes = 0;
    backup.memoApi = {
        async get(url) {
            return url.includes('per_page')
                ? { data: [{ id: 'existing', public: false, files: { [name]: {} } }], headers: {} }
                : { data: { public: false, files: { [name]: { content: remote } } } };
        },
        async patch(url, data) {
            assert.equal(url, '/gists/existing');
            writes++;
            remote = data.files[name].content;
        },
        async post() { assert.fail('The existing date Gist must be reused'); }
    };
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await fs.writeFile(path.join(directory, name), first);
    backup.backupMemo(config.UPDATE.BACKUP_INTERVAL);
    t.mock.timers.tick(3000);
    assert.equal(writes, 0);
    await fs.appendFile(path.join(directory, name), second);
    const scheduled = backup.backupMemo(config.UPDATE.BACKUP_INTERVAL);
    t.mock.timers.tick(4999);
    await backup.backupTask;
    assert.equal(writes, 0);
    t.mock.timers.tick(1);
    await backup.backupTask;
    assert.equal(writes, 1);
    assert.equal(remote, cloud + first + second);
    assert(backup.status.completedRevision >= scheduled.revision);
    assert.equal(backup.status.error, null);
});

test('failed Gist authentication is reported and queued memos are retried without a new input', async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yobot-gist-test-'));
    const backup = new GistBackup();
    backup.backupDir = directory;
    t.after(async () => {
        await backup.destroy();
        assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
        assert(path.basename(directory).startsWith('yobot-gist-test-'));
        await fs.rm(directory, { recursive: true, force: true });
    });
    const name = 'memo_20261106.txt';
    const content = '재시도할 메모 (20261106 11:00:00)\n';
    await fs.writeFile(path.join(directory, name), content);
    let offline = true;
    const uploads = [];
    backup.memoApi = {
        async get() {
            if (offline) throw Object.assign(new Error('secret should not appear in status'), { response: { status: 401 } });
            return { data: [], headers: {} };
        },
        async post(url, data) { uploads.push(data.files[name].content); }
    };
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await backup.backupMemo();
    assert(backup.status.error.message.includes('401'));
    assert(!backup.status.error.message.includes('secret'));
    assert.equal(backup.status.completedRevision, 0);
    assert.equal(backup.syncedMemos.has(name), false);
    offline = false;
    t.mock.timers.tick(15000);
    await backup.backupTask;
    assert.deepEqual(uploads, [content]);
    assert.equal(backup.status.error, null);
    assert(backup.status.completedRevision > 0);
});
