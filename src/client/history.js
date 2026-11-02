import config from '../config.js';
import SoopFormatter from './chat/soop/SoopFormatter.js';

const params = new URLSearchParams(location.search);
const platform = params.get('platform');
const userId = params.get('userId');
const labels = { chzzk: '치지직', soop: '숲', twitch: '트위치' };
const viewport = document.getElementById('viewport');
const messagesNode = document.getElementById('messages');
const status = document.getElementById('status');
const more = document.getElementById('more');
const refresh = document.getElementById('refresh');
const soop = new SoopFormatter();
const records = [];
const seen = new Set();
const ROW_HEIGHT = 108;
let nextCursor;
let loading = false;
let destroyed = false;
let frame;
let socket;
let reconnectTimer;
let controller;
let generation = 0;
let renderedRange = '';

function setStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
}

function image(url, alt) {
    const node = document.createElement('img');
    node.className = 'chat-message-emote';
    node.alt = alt;
    node.loading = 'lazy';
    if (!/^https:\/\//i.test(url)) return document.createTextNode(alt);
    node.src = url;
    node.onerror = () => { node.onerror = null; node.replaceWith(document.createTextNode(alt)); };
    return node;
}

function renderContent(record, node) {
    const content = record.content || '';
    const metadata = record.metadata || {};
    if (platform === 'soop') {
        // The formatter escapes user text before substituting known tokens.
        node.innerHTML = soop.formatContent(content);
        if (record.kind === 'sticker' && metadata.stickerId && metadata.stickerNum) {
            const extension = /^(png|webp|gif)$/.test(metadata.extension) ? metadata.extension : 'png';
            node.prepend(image(`https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/${encodeURIComponent(metadata.stickerId)}/${encodeURIComponent(metadata.stickerNum)}_80.${extension}?ver=1`, 'OGQ 이모티콘'));
        }
        if (record.kind === 'donation') node.append(document.createTextNode(` ${Number(metadata.amount) || 0}개`));
    } else if (platform === 'chzzk') {
        let offset = 0;
        for (const match of content.matchAll(/\{:([^:]+):\}/g)) {
            node.append(document.createTextNode(content.slice(offset, match.index)));
            const url = metadata.emojis?.[match[1]];
            node.append(typeof url === 'string' ? image(url, match[0]) : document.createTextNode(match[0]));
            offset = match.index + match[0].length;
        }
        node.append(document.createTextNode(content.slice(offset)));
    } else {
        const chars = Array.from(content);
        const ranges = [];
        for (const group of String(metadata.emotes || '').split('/')) {
            const [id, positions] = group.split(':');
            if (!/^[\w-]+$/.test(id) || !positions) continue;
            for (const position of positions.split(',')) {
                if (!/^\d+-\d+$/.test(position)) continue;
                const [start, end] = position.split('-').map(Number);
                if (start <= end && end < chars.length) ranges.push({ id, start, end });
            }
        }
        ranges.sort((a, b) => a.start - b.start);
        let offset = 0;
        for (const range of ranges) {
            if (range.start < offset) continue;
            node.append(document.createTextNode(chars.slice(offset, range.start).join('')));
            node.append(image(`https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/1.0`, chars.slice(range.start, range.end + 1).join('')));
            offset = range.end + 1;
        }
        node.append(document.createTextNode(chars.slice(offset).join('')));
    }
}

function render() {
    const start = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - 5);
    const end = Math.min(records.length, start + Math.ceil(viewport.clientHeight / ROW_HEIGHT) + 10);
    const range = `${generation}:${records.length}:${start}:${end}`;
    if (range === renderedRange) return;
    renderedRange = range;
    document.getElementById('top-spacer').style.height = `${start * ROW_HEIGHT}px`;
    document.getElementById('bottom-spacer').style.height = `${Math.max(0, records.length - end) * ROW_HEIGHT}px`;
    const fragment = document.createDocumentFragment();
    for (let index = start; index < end; index++) {
        const record = records[index];
        const row = document.createElement('article');
        row.className = 'record';
        row.setAttribute('role', 'listitem');
        const meta = document.createElement('div');
        meta.className = 'record-meta';
        meta.textContent = `${new Date(record.receivedAt).toLocaleString('ko-KR')} · 방송 ${record.channelId || '알 수 없음'}`;
        const name = document.createElement('div');
        name.className = 'record-nickname';
        name.textContent = record.nickname;
        const content = document.createElement('div');
        content.className = 'record-content';
        renderContent(record, content);
        row.append(meta, name, content);
        fragment.append(row);
    }
    messagesNode.replaceChildren(fragment);
}

async function load(reset = false) {
    if (destroyed || (loading && !reset) || (!reset && nextCursor === null)) return;
    if (reset) controller?.abort();
    loading = true;
    const requestGeneration = reset ? ++generation : generation;
    controller = new AbortController();
    more.disabled = true;
    setStatus('기록을 불러오는 중…');
    try {
        const query = new URLSearchParams({ platform, userId });
        if (!reset && nextCursor !== undefined) query.set('before', nextCursor);
        const response = await fetch(`/api/chat-history?${query}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error((await response.json()).error || '기록을 불러오지 못했습니다.');
        const data = await response.json();
        if (requestGeneration !== generation || destroyed) return;
        if (reset) { records.length = 0; seen.clear(); viewport.scrollTop = 0; }
        for (const record of data.messages) {
            if (!seen.has(record.sequence)) { records.push(record); seen.add(record.sequence); }
        }
        nextCursor = data.nextCursor;
        document.getElementById('nickname').textContent = data.nickname;
        document.getElementById('count').textContent = `저장 ${data.total.toLocaleString()} / ${data.capacity.toLocaleString()}개 · 불러옴 ${records.length.toLocaleString()}개`;
        document.title = `${data.nickname} · ${labels[platform]} 채팅 기록`;
        setStatus(records.length ? (nextCursor === null ? '저장된 기록을 모두 불러왔습니다.' : '') : '아직 저장된 채팅이 없습니다. 기능을 켠 이후 수신한 채팅부터 기록됩니다.');
        render();
    } catch (error) {
        if (error.name !== 'AbortError') setStatus(error.message, true);
    } finally {
        if (requestGeneration === generation) { loading = false; more.disabled = nextCursor === null; }
    }
}

viewport.addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = null; render(); });
    if (viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 250) load();
});
window.addEventListener('resize', render);
more.addEventListener('click', () => load());
refresh.addEventListener('click', () => load(true));
document.getElementById('top').addEventListener('click', () => { viewport.scrollTop = 0; });

// Keep the server running even if the main chat window closes. This socket does
// not subscribe to the full chat stream; only this user's new-chat notices arrive.
function connect() {
    if (destroyed) return;
    const query = new URLSearchParams({ history: '1', platform, userId });
    socket = new WebSocket(`ws://localhost:${config.PORT.CHAT_DISPLAY}/?${query}`);
    socket.onmessage = event => {
        try {
            if (JSON.parse(event.data).messageType === 'history_changed') {
                refresh.textContent = '새 채팅 보기';
            }
        } catch { /* Ignore malformed notices. */ }
    };
    socket.onclose = () => { if (!destroyed) reconnectTimer = setTimeout(connect, 3000); };
    socket.onerror = () => socket.close();
}
refresh.addEventListener('click', () => { refresh.textContent = '최신 기록'; });
window.addEventListener('pagehide', () => {
    destroyed = true;
    controller?.abort();
    clearTimeout(reconnectTimer);
    cancelAnimationFrame(frame);
    socket?.close(1000);
});
if (!labels[platform] || !userId) {
    more.disabled = true;
    refresh.disabled = true;
    setStatus('사용자 정보가 없습니다. 채팅 창에서 닉네임을 클릭해 주세요.', true);
} else {
    document.getElementById('platform').textContent = labels[platform];
    document.getElementById('identity').textContent = `계정 ID: ${userId}`;
    connect();
    load(true);
}
