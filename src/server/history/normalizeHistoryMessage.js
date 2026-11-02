const PLATFORMS = new Set(['chzzk', 'soop', 'twitch']);
export { PLATFORMS };

function parseObject(value) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
}
const text = value => typeof value === 'string' ? value : '';

// Store an explicit allowlist: upstream profile/extras can contain access tokens.
export function normalizeHistoryMessage(message, channels = {}) {
    const platform = message.messageType;
    if (!PLATFORMS.has(platform)) return null;
    const profile = platform === 'chzzk' ? parseObject(message.profile) : {};
    const rawId = platform === 'chzzk' ? (profile.userIdHash || message.uid || message.userId) : message.userId;
    const userId = String(rawId || '').trim();
    if (!userId || userId.length > 256 || userId === 'anonymous') return null;
    // Twitch login names can change; only the numeric account identifier is stable.
    if (platform === 'twitch' && !/^\d+$/.test(userId)) return null;
    const nickname = text(platform === 'chzzk' ? profile.nickname : message.nickname) || userId;
    const content = text(platform === 'chzzk' ? message.msg : message.content);
    if (!content && !['sticker', 'donation'].includes(message.type)) return null;
    const receivedAt = Date.now();
    const metadata = {};
    if (platform === 'chzzk') {
        const emojis = parseObject(message.extras).emojis;
        if (emojis && typeof emojis === 'object') {
            metadata.emojis = Object.fromEntries(Object.entries(emojis).filter(([key, url]) =>
                key.length <= 200 && typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 200));
        }
    } else if (platform === 'twitch') {
        metadata.emotes = text(message.emotes);
    } else if (message.type === 'sticker') {
        for (const key of ['stickerId', 'stickerNum', 'extension']) metadata[key] = text(String(message[key] || ''));
    } else if (message.type === 'donation') {
        metadata.amount = Number(message.amount) || 0;
    }
    return {
        platform, userId, nickname: nickname.slice(0, 256), content,
        channelId: String(channels[platform] || message.roomId || message.cid || ''),
        kind: message.type || 'text', receivedAt,
        sourceId: text(platform === 'twitch' ? message.messageId : message.msgTid) || null,
        metadata
    };
}
