import { PLATFORMS } from './normalizeHistoryMessage.js';

export function createHistoryHandler(store) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const address = req.socket?.remoteAddress;
        if (address && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
            return res.status(403).json({ error: '채팅 기록은 이 PC에서만 조회할 수 있습니다.' });
        }
        const { platform, userId, before } = req.query;
        if (!PLATFORMS.has(platform) || typeof userId !== 'string' || !userId || userId.length > 256 ||
            (before !== undefined && (typeof before !== 'string' || !/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)) || Number(before) < 1))) {
            return res.status(400).json({ error: '올바른 플랫폼, 사용자 ID, 조회 위치가 필요합니다.' });
        }
        try {
            const result = await store.query({ platform, userId, ...(before !== undefined && { before: Number(before) }), limit: 100 });
            res.json(result);
        } catch (error) {
            console.error('채팅 기록 조회 실패:', error.message);
            res.status(503).json({ error: '채팅 기록을 읽지 못했습니다. 저장 공간과 서버 상태를 확인하세요.' });
        }
    };
}

export function createNotesHandler(store) {
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
            return res.status(403).json({ error: '매니저 댓글은 이 PC에서만 사용할 수 있습니다.' });
        }
        const { platform, userId } = req.query;
        if (!PLATFORMS.has(platform) || typeof userId !== 'string' || !userId || userId.length > 256) {
            return res.status(400).json({ error: '올바른 플랫폼과 사용자 ID가 필요합니다.' });
        }
        const writing = req.method === 'POST';
        const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
        if (writing && (!req.is('application/json') || !content || content.length > 2000)) {
            return res.status(400).json({ error: '댓글을 1~2,000자로 입력해 주세요.' });
        }
        try {
            const result = await store.request(writing ? 'addNote' : 'notes', { platform, userId, content });
            res.status(writing ? 201 : 200).json(result);
        } catch (error) {
            console.error('매니저 댓글 처리 실패:', error.message);
            res.status(503).json({ error: '매니저 댓글을 처리하지 못했습니다.' });
        }
    };
}
