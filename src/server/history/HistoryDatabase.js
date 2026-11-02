import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export function validateHistoryLimit(value = 999) {
    if (!Number.isInteger(value) || value < 1 || value > 9999) {
        throw new Error('CHAT_HISTORY.MAX_MESSAGES_PER_USER는 1~9999 사이 정수여야 합니다.');
    }
    return value;
}

export default class HistoryDatabase {
    constructor(filePath, limit) {
        this.limit = validateHistoryLimit(limit);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        this.db = new DatabaseSync(filePath);
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;
            CREATE TABLE IF NOT EXISTS history_users (
                platform TEXT NOT NULL, user_id TEXT NOT NULL, nickname TEXT NOT NULL,
                next_seq INTEGER NOT NULL DEFAULT 1, capacity INTEGER NOT NULL,
                PRIMARY KEY(platform, user_id));
            CREATE TABLE IF NOT EXISTS history_messages (
                platform TEXT NOT NULL, user_id TEXT NOT NULL, slot INTEGER NOT NULL,
                seq INTEGER NOT NULL, received_at INTEGER NOT NULL, nickname TEXT NOT NULL,
                channel_id TEXT NOT NULL, source_id TEXT, payload TEXT NOT NULL,
                PRIMARY KEY(platform, user_id, slot));
            CREATE INDEX IF NOT EXISTS history_order ON history_messages(platform,user_id,seq DESC);
            CREATE INDEX IF NOT EXISTS history_source ON history_messages(platform,user_id,channel_id,source_id)
                WHERE source_id IS NOT NULL;`);
        this.statements = {
            user: this.db.prepare('SELECT * FROM history_users WHERE platform=? AND user_id=?'),
            create: this.db.prepare('INSERT INTO history_users(platform,user_id,nickname,capacity) VALUES(?,?,?,?)'),
            update: this.db.prepare('UPDATE history_users SET nickname=?,next_seq=? WHERE platform=? AND user_id=?'),
            insert: this.db.prepare(`INSERT INTO history_messages VALUES(?,?,?,?,?,?,?,?,?)
                ON CONFLICT(platform,user_id,slot) DO UPDATE SET seq=excluded.seq,
                received_at=excluded.received_at,nickname=excluded.nickname,channel_id=excluded.channel_id,
                source_id=excluded.source_id,payload=excluded.payload`),
            duplicate: this.db.prepare('SELECT 1 FROM history_messages WHERE platform=? AND user_id=? AND channel_id=? AND source_id=? LIMIT 1'),
            page: this.db.prepare('SELECT * FROM history_messages WHERE platform=? AND user_id=? AND seq<? ORDER BY seq DESC LIMIT ?'),
            count: this.db.prepare('SELECT COUNT(*) AS count FROM history_messages WHERE platform=? AND user_id=?')
        };
    }

    // Called only after configuration changes, never on each incoming message.
    *resizeUsers() {
        const users = this.db.prepare('SELECT platform,user_id FROM history_users WHERE capacity<>?').all(this.limit);
        const latest = this.db.prepare('SELECT * FROM history_messages WHERE platform=? AND user_id=? ORDER BY seq DESC LIMIT ?');
        const remove = this.db.prepare('DELETE FROM history_messages WHERE platform=? AND user_id=?');
        const capacity = this.db.prepare('UPDATE history_users SET capacity=? WHERE platform=? AND user_id=?');
        for (const user of users) {
            this.transaction(() => {
                const rows = latest.all(user.platform, user.user_id, this.limit);
                remove.run(user.platform, user.user_id);
                for (const row of rows) this.statements.insert.run(row.platform, row.user_id,
                    row.seq % this.limit, row.seq, row.received_at, row.nickname, row.channel_id, row.source_id, row.payload);
                capacity.run(this.limit, user.platform, user.user_id);
            });
            yield user;
        }
    }

    transaction(operation) {
        this.db.exec('BEGIN IMMEDIATE');
        try { const result = operation(); this.db.exec('COMMIT'); return result; }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }

    appendBatch(messages) {
        this.transaction(() => {
            for (const message of messages) {
                const { platform, userId, nickname, sourceId, channelId } = message;
                if (sourceId && this.statements.duplicate.get(platform, userId, channelId, sourceId)) continue;
                let user = this.statements.user.get(platform, userId);
                if (!user) {
                    this.statements.create.run(platform, userId, nickname, this.limit);
                    user = { next_seq: 1 };
                }
                const seq = user.next_seq;
                this.statements.insert.run(platform, userId, seq % this.limit, seq, message.receivedAt,
                    nickname, channelId, sourceId, JSON.stringify({ content: message.content, kind: message.kind, metadata: message.metadata }));
                this.statements.update.run(nickname, seq + 1, platform, userId);
            }
        });
    }

    query({ platform, userId, before = Number.MAX_SAFE_INTEGER, limit = 100 }) {
        const user = this.statements.user.get(platform, userId);
        const rows = this.statements.page.all(platform, userId, before, limit + 1);
        const hasMore = rows.length > limit;
        const messages = rows.slice(0, limit).map(row => ({
            sequence: row.seq, receivedAt: row.received_at, nickname: row.nickname,
            channelId: row.channel_id, ...JSON.parse(row.payload)
        }));
        return { platform, userId, nickname: user?.nickname || userId, capacity: this.limit,
            total: this.statements.count.get(platform, userId).count, messages,
            nextCursor: hasMore ? messages.at(-1).sequence : null };
    }

    close() { this.db.close(); }
}
