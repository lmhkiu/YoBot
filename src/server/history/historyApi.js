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
