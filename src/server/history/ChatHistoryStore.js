import { Worker } from 'node:worker_threads';
import path from 'node:path';
import os from 'node:os';
import { normalizeHistoryMessage } from './normalizeHistoryMessage.js';

export default class ChatHistoryStore {
    constructor({ limit = 9999, filePath = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'YoBot', 'data', 'chat-history.sqlite'), channels = {}, onError = console.error } = {}) {
        if (!Number.isInteger(limit) || limit < 1 || limit > 9999) throw new Error('CHAT_HISTORY.MAX_MESSAGES_PER_USER는 1~9999 사이 정수여야 합니다.');
        this.channels = channels;
        this.onError = onError;
        this.queue = [];
        this.pending = new Map();
        this.nextId = 0;
        this.closed = false;
        this.failure = null;
        this.writeTask = null;
        this.worker = new Worker(new URL('./historyWorker.js', import.meta.url), { workerData: { filePath, limit } });
        this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
        this.worker.on('message', message => {
            if (message.ready) { this.resolveReady(); return; }
            const request = this.pending.get(message.id);
            if (!request) return;
            this.pending.delete(message.id);
            if (message.error) request.reject(new Error(message.error));
            else request.resolve(message.result);
        });
        this.worker.on('error', error => this.fail(error));
        this.worker.on('exit', code => {
            if (!this.closed || this.pending.size) this.fail(new Error(`채팅 기록 작업이 종료되었습니다 (${code}).`));
        });
        this.timer = setInterval(() => this.flush().catch(error => this.fail(error)), 250);
        this.timer.unref();
    }

    fail(error) {
        if (this.failure) return;
        this.failure = error;
        clearInterval(this.timer);
        this.rejectReady(error);
        for (const request of this.pending.values()) request.reject(error);
        this.pending.clear();
        this.onError('채팅 기록 저장 실패:', error);
    }

    async request(action, data) {
        await this.ready;
        if (this.failure) throw this.failure;
        const id = ++this.nextId;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, action, data });
        });
    }

    record(message) {
        const entry = normalizeHistoryMessage(message, this.channels);
        if (!entry || this.closed || this.failure) return null;
        // Bound memory during a stalled disk; do not silently discard records.
        if (this.queue.length >= 20000) {
            this.fail(new Error('채팅 기록 저장 대기열이 가득 찼습니다. 디스크 상태를 확인하세요.'));
            return null;
        }
        this.queue.push(entry);
        if (this.queue.length >= 100) this.flush().catch(error => this.fail(error));
        return { platform: entry.platform, userId: entry.userId };
    }

    async flush() {
        if (this.failure) throw this.failure;
        if (this.writeTask) return this.writeTask;
        if (!this.queue.length) return;
        const batch = this.queue.splice(0, 500);
        this.writeTask = this.request('append', batch);
        try { await this.writeTask; }
        finally { this.writeTask = null; }
    }

    async query(options) {
        if (this.closed) throw new Error('채팅 기록 저장소가 종료되었습니다.');
        // Include buffered messages before answering a click immediately after a chat.
        do { await this.flush(); } while (this.queue.length);
        return this.request('query', options);
    }

    async close() {
        if (this.closed) return this.closeTask;
        this.closed = true;
        clearInterval(this.timer);
        this.closeTask = (async () => {
            try {
                do { await this.flush(); } while (this.queue.length);
                await this.request('close');
            } finally { await this.worker.terminate(); }
        })();
        return this.closeTask;
    }
}
