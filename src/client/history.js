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
let loadedCount = 0;
let nextCursor;
let loading = false;
let destroyed = false;
let socket;
let reconnectTimer;
let controller;
let generation = 0;

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

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' });
const timeFormat = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function renderPage(page, reset) {
    const oldTop = viewport.scrollTop;
    const oldHeight = viewport.scrollHeight;
    if (reset) messagesNode.replaceChildren();
    const fragment = document.createDocumentFragment();
    let previousDate;
    for (const record of [...page].reverse()) {
        const date = dateFormat.format(record.receivedAt);
        if (date !== previousDate) {
            const divider = document.createElement('h2');
            divider.className = 'date-divider';
            divider.textContent = date;
            fragment.append(divider);
            previousDate = date;
        }
        const row = document.createElement('article');
        row.className = 'record';
        const time = document.createElement('time');
        time.className = 'record-meta';
        time.dateTime = new Date(record.receivedAt).toISOString();
        time.textContent = timeFormat.format(record.receivedAt);
        if (record.channelId) time.title = '방송 ' + record.channelId;
        const name = document.createElement('span');
        name.className = 'record-nickname';
        name.textContent = record.nickname;
        const content = document.createElement('span');
        content.className = 'record-content';
        renderContent(record, content);
        row.append(time, ' ', name, ' ', content);
        fragment.append(row);
    }
    if (previousDate && messagesNode.firstElementChild?.textContent === previousDate) {
        messagesNode.firstElementChild.remove();
    }
    messagesNode.prepend(fragment);
    more.hidden = nextCursor === null;
    viewport.scrollTop = reset ? viewport.scrollHeight : oldTop + viewport.scrollHeight - oldHeight;
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
        const response = await fetch('/api/chat-history?' + query, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error((await response.json()).error || '기록을 불러오지 못했습니다.');
        const data = await response.json();
        if (requestGeneration !== generation || destroyed) return;
        nextCursor = data.nextCursor;
        loadedCount = (reset ? 0 : loadedCount) + data.messages.length;
        document.getElementById('nickname').textContent = data.nickname;
        document.getElementById('count').textContent = '저장 ' + data.total.toLocaleString() + ' / ' + data.capacity.toLocaleString() + '개';
        document.title = data.nickname + ' · ' + labels[platform] + ' 채팅 기록';
        setStatus(loadedCount ? '' : '아직 저장된 채팅이 없습니다.');
        renderPage(data.messages, reset);
        if (reset && chatPanel.hidden) scrollChatToBottom = true;
    } catch (error) {
        if (error.name !== 'AbortError') setStatus(error.message, true);
    } finally {
        if (requestGeneration === generation) {
            loading = false;
            more.disabled = nextCursor === null;
        }
    }
}

const chatPanel = document.getElementById('chat-panel');
const notesPanel = document.getElementById('notes-panel');
const chatTab = document.getElementById('chat-tab');
const notesTab = document.getElementById('notes-tab');
const notesList = document.getElementById('notes');
const notesStatus = document.getElementById('notes-status');
const noteForm = document.getElementById('note-form');
const noteInput = document.getElementById('note-input');
const noteSubmit = document.getElementById('note-submit');
let notesBusy = false;
let scrollChatToBottom = false;

async function notesRequest(options) {
    const query = new URLSearchParams({ platform, userId });
    const response = await fetch('/api/chat-history/notes?' + query, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '매니저 댓글을 처리하지 못했습니다.');
    return data;
}

function appendNote(note) {
    const row = document.createElement('article');
    row.className = 'note';
    const date = document.createElement('time');
    date.className = 'record-meta';
    date.dateTime = new Date(note.createdAt).toISOString();
    date.textContent = dateFormat.format(note.createdAt) + ' ' + timeFormat.format(note.createdAt);
    const content = document.createElement('div');
    content.className = 'record-content';
    content.textContent = note.content;
    row.append(date, content);
    notesList.append(row);
}

async function loadNotes() {
    if (notesBusy) return;
    notesBusy = true;
    noteSubmit.disabled = true;
    notesStatus.textContent = '댓글을 불러오는 중…';
    try {
        const notes = await notesRequest();
        notesList.replaceChildren();
        for (const note of notes) appendNote(note);
        notesStatus.textContent = notes.length ? '' : '아직 작성한 매니저 댓글이 없습니다.';
        notesList.scrollTop = notesList.scrollHeight;
    } catch (error) {
        notesStatus.textContent = error.message;
    } finally {
        notesBusy = false;
        noteSubmit.disabled = false;
    }
}

chatTab.addEventListener('click', () => {
    chatPanel.hidden = false;
    notesPanel.hidden = true;
    chatTab.setAttribute('aria-pressed', 'true');
    notesTab.setAttribute('aria-pressed', 'false');
    if (scrollChatToBottom) {
        viewport.scrollTop = viewport.scrollHeight;
        scrollChatToBottom = false;
    }
});
notesTab.addEventListener('click', () => {
    chatPanel.hidden = true;
    notesPanel.hidden = false;
    chatTab.setAttribute('aria-pressed', 'false');
    notesTab.setAttribute('aria-pressed', 'true');
    loadNotes();
});
noteForm.addEventListener('submit', async event => {
    event.preventDefault();
    const content = noteInput.value.trim();
    if (notesBusy || !content) return;
    notesBusy = true;
    noteSubmit.disabled = true;
    noteInput.readOnly = true;
    try {
        const note = await notesRequest({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        appendNote(note);
        noteInput.value = '';
        notesStatus.textContent = '';
        notesList.scrollTop = notesList.scrollHeight;
    } catch (error) {
        notesStatus.textContent = error.message;
    } finally {
        notesBusy = false;
        noteSubmit.disabled = false;
        noteInput.readOnly = false;
    }
});

viewport.addEventListener('scroll', () => {
    if (!chatPanel.hidden && viewport.scrollTop <= 100) load();
});
more.addEventListener('click', () => load());
refresh.addEventListener('click', () => load(true));

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
    socket?.close(1000);
});
if (!labels[platform] || !userId) {
    more.disabled = true;
    refresh.disabled = true;
    notesTab.disabled = true;
    setStatus('사용자 정보가 없습니다. 채팅 창에서 닉네임을 클릭해 주세요.', true);
} else {
    document.getElementById('platform').textContent = labels[platform];
    document.getElementById('identity').textContent = `계정 ID: ${userId}`;
    connect();
    load(true);
}
