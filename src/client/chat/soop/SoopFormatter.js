import { SOOP_EMOTICONS } from './SoopEmoticons.js';

const EMOTICON_BASE_URL = 'https://res.sooplive.com/images/chat/emoticon/big/';

export default class SoopFormatter {
    format(chat) {
        const platformImg = "<img class='chat-message-platform-icon' src='./assets/chat/icon/soop/icon_24.png'>";
        const nickname = this.escapeHtml(chat.nickname);
        let content = this.formatContent(chat.content);

        if (chat.type === 'sticker') {
            const stickerId = encodeURIComponent(chat.stickerId);
            const stickerNum = encodeURIComponent(chat.stickerNum);
            const extension = /^(png|webp|gif)$/i.test(chat.extension) ? chat.extension.toLowerCase() : 'png';
            const src = `https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/${stickerId}/${stickerNum}_80.${extension}?ver=1`;
            content = `<img class="chat-message-emote" src="${src}" alt="OGQ 이모티콘" onerror="this.onerror=null;this.src='https://res.sooplive.com/images/chat/ogq_default.svg'">${content}`;
        } else if (chat.type === 'donation') {
            const amount = Number.parseInt(chat.amount, 10);
            const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
            content = `<img src="https://res.sooplive.com/new_player/items/m_balloon_${safeAmount}.png" alt="별풍선"> ${content} ${safeAmount}개`;
        }

        return `<div class="chat-message">
            <div class="chat-message-platform-icon-container">${platformImg}</div>
            <div class="chat-message-nickname-container">
                <img class="chat-message-badge" alt="badge" style="display: none;">
                <div class="chat-message-nickname">${nickname}</div>
            </div>
            <div class="chat-message-content-container">${content}</div>
        </div>`;
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[char]);
    }

    formatContent(content) {
        // 원본 채팅은 변경하지 않는다. 같은 메시지를 다시 표시해도 결과가 같다.
        return this.escapeHtml(content)
            .replace(/\/([^/\r\n]+)\//g, token => this.getBuiltinEmoticonNumber(token) || token)
            .replace(/\r?\n/g, '<br>');
    }

    getBuiltinEmoticonNumber(token) {
        const emoticon = SOOP_EMOTICONS.get(token);
        if (!emoticon) return null;

        const src = EMOTICON_BASE_URL + emoticon.fileName;
        const fallback = emoticon.staticFileName ? ` data-fallback="${EMOTICON_BASE_URL + emoticon.staticFileName}"` : '';
        // 애니메이션 로드 실패 시 정지 이미지, 그것도 실패하면 원래 토큰을 표시한다.
        const onerror = "if(this.dataset.fallback){const fallback=this.dataset.fallback;delete this.dataset.fallback;this.src=fallback;}else{this.onerror=null;this.replaceWith(document.createTextNode(this.alt));}";
        return `<img class="chat-message-emote" src="${src}" alt="${this.escapeHtml(token)}"${fallback} onerror="${onerror}">`;
    }

    parseGrade(userFlag) {
        if (String(userFlag ?? '').includes('538001440')) return { grade: 'fan', char: 'F', tip: '팬클럽' };
        return { grade: 'normal', char: '', tip: '' };
    }
}
