// scrapper 서버에서 가져온 채팅을 수신하는 client.
// 수신한 채팅들을 각 플랫폼 별 formatter를 사용하여 chat conatiner에 추가한다.

import config from '../../config.js';
import ChzzkFormatter from './chzzk/ChzzkFormatter.js';
import SoopFormatter from './soop/SoopFormatter.js';
import TwitchFormatter from './twitch/TwitchFormatter.js';

// 치지직 공식 웹의 다크 테마 기본 색상표와 선택 규칙을 사용한다.
// https://ssl.pstatic.net/static/nng/glive/resource/p/static/js/index-DWn2Eab5.js
const CHZZK_DEFAULT_COLORS = (
    '#EEA05D.#EAA35F.#E98158.#E97F58.#E76D53.#E66D5F.#E16490.#E481AE.' +
    '#E481AE.#D25FAC.#D263AE.#D66CB4.#D071B6.#AF71B5.#A96BB2.#905FAA.' +
    '#B38BC2.#9D78B8.#8D7AB8.#7F68AE.#9F99C8.#717DC6.#7E8BC2.#5A90C0.' +
    '#628DCC.#81A1CA.#ADD2DE.#83C5D6.#8BC8CB.#91CBC6.#83C3BB.#7DBFB2.' +
    '#AAD6C2.#84C194.#92C896.#94C994.#9FCE8E.#A6D293.#ABD373.#BFDE73'
).split('.');

// https://api.chzzk.naver.com/service/v2/nickname/color/codes
const CHZZK_SELECTED_COLORS = (
    '#E2BE61.#ECA843.#EC8A43.#EA723D.#E56B79.#E68199.#E16CB5.#BC7ACC.' +
    '#A983E7.#8B89E1.#7194EE.#7994D0.#71AAED.#5FB7E8.#80BDD3.#80D3CE.' +
    '#99D3BA.#94D59A.#BBE69A.#CCE57D'
).split('.');

const CHZZK_COLOR_CODES = new Map([
    ...CHZZK_DEFAULT_COLORS.map((color, index) => [`CD${String(index + 1).padStart(3, '0')}`, color]),
    ...CHZZK_SELECTED_COLORS.map((color, index) => [`CC${String(index + 1).padStart(3, '0')}`, color]),
    ['SG001', '#F3E659'], ['SG002', '#EEEC69'], ['SG003', '#6BE5AA'],
    ['SG004', '#5DA8EC'], ['SG005', '#D581FF'],
    ['SH001', '#C9CEDC'], ['SH002', '#C9CEDC'], ['SH003', '#C9CEDC'],
    ['SH004', '#C9CEDC'], ['SH005', '#C9CEDC'], ['SS001', '#00000000']
]);

// 숲 공식 채팅 CSS의 다크 모드 닉네임 색상표.
// https://res.sooplive.com/css/global/chat/chat.css
const SOOP_DARK_NICKNAME_COLORS = new Map([
    ['#E12E2E', '#E04949'],
    ['#A90A0A', '#CD5D5D'],
    ['#EB500D', '#DB6743'],
    ['#C25111', '#CF8362'],
    ['#E07E0A', '#D39750'],
    ['#B26C03', '#C4A557'],
    ['#648E0B', '#97A65B'],
    ['#119937', '#36A624'],
    ['#158304', '#63B566'],
    ['#047143', '#45A48D'],
    ['#0799B9', '#58A6B7'],
    ['#0B6D82', '#6CABCF'],
    ['#0C80D3', '#288ED8'],
    ['#0C61E1', '#5C82E3'],
    ['#1915BF', '#6F6DD6'],
    ['#6518C8', '#9568CD'],
    ['#AD19E1', '#B477CA'],
    ['#DD32E0', '#D15ED3'],
    ['#DC3585', '#CF5F9B'],
    ['#C40F70', '#C279A1']
]);

export default class ChatDisplay {

    constructor() {
        this.chatContainer = null;
        this.ws = null;
        this.chzzkFormatter = null;
        this.soopFormatter = null;
        this.twitchFormatter = null;

        this.chatMemoController = null;
        this.autoScrollEnabled = true;

        // 탭 쓰로틀링(비활성 탭 멈추는 현상) 방지
        this.connectionStartTime = null;
        this.keepaliveTimer = null;
        this.reconnectTimer = null;
        this.isReconnecting = false;
        this.pendingWs = null;
        this.connectionTimeoutTimer = null;
        this.retryTimer = null;
        this.destroyed = false;
        this.seenMessageIds = new Set();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;

        // 마지막 메시지 시간 (탭 쓰로틀링 방지)
        this.lastMessageTime = null;
    }

    async init(chatMemoController) {
        this.chatMemoController = chatMemoController;
        this.chzzkFormatter = new ChzzkFormatter();
        this.soopFormatter = new SoopFormatter();
        this.twitchFormatter = new TwitchFormatter();

        this.connectWebSocket();

        this.setScrollListener();
        
        
    }

    setScrollListener() {
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.addEventListener('scroll', () => {
            // 스크롤이 가장 아래에 있는지 확인
            const isAtBottom = chatMessages.scrollTop + chatMessages.clientHeight >= chatMessages.scrollHeight - config.SCROLL.BOTTOM_TOLERANCE;
            this.autoScrollEnabled = isAtBottom;
        });
    }

    // 최초 접속과 주기적 교체 모두 같은 이벤트 등록 경로를 사용한다.
    connectWebSocket(replace = false) {
        if (this.destroyed || this.pendingWs ||
            (!replace && this.ws?.readyState === WebSocket.OPEN)) return;

        this.clearRetryTimer();
        this.isReconnecting = true;
        let socket;
        try {
            socket = new WebSocket(`ws://localhost:${config.PORT.CHAT_DISPLAY}`);
        } catch (error) {
            console.error('ChatDisplay connection setup failed', error);
            this.isReconnecting = false;
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.schedulePreemptiveReconnect();
            } else {
                this.attemptReconnect();
            }
            return;
        }
        this.pendingWs = socket;

        socket.onmessage = (event) => {
            if (!this.destroyed && this.ws === socket) {
                this.handleMessage(event);
            }
        };
        socket.onclose = (event) => {
            console.log('ChatDisplay disconnected from server', event);
            this.handleSocketFailure(socket);
        };
        socket.onerror = () => this.handleSocketFailure(socket);
        socket.onopen = () => {
            if (this.destroyed || this.pendingWs !== socket) return;

            const previousSocket = this.ws;
            this.clearConnectionTimeout();
            this.pendingWs = null;
            this.ws = socket;
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            this.connectionStartTime = Date.now();

            // 새 연결로 교체하고, 이전 연결의 종료가 재접속을 일으키지 않도록 한다.
            this.closeSocket(previousSocket);
            this.startKeepalive();
            this.schedulePreemptiveReconnect();
            this.requestMissedMessages();
            socket.send(JSON.stringify({ messageType: 'request_broad_time' }));
            console.log('ChatDisplay connected to server');
        };

        // 연결이 완료되지 않으면 시도를 정리하고 기존 연결을 유지한다.
        this.connectionTimeoutTimer = setTimeout(() => {
            this.connectionTimeoutTimer = null;
            this.handleSocketFailure(socket);
        }, 10000);
    }

    handleSocketFailure(socket) {
        if (this.destroyed || (socket !== this.ws && socket !== this.pendingWs)) return;

        if (socket === this.pendingWs) {
            this.pendingWs = null;
            this.clearConnectionTimeout();
        }
        if (socket === this.ws) {
            this.ws = null;
            this.clearKeepaliveTimer();
            this.clearReconnectTimer();
        }
        this.closeSocket(socket);

        // 교체할 연결을 기다리는 중이면 추가 재접속을 예약하지 않는다.
        if (this.pendingWs) return;
        this.isReconnecting = false;
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.schedulePreemptiveReconnect();
        } else {
            this.attemptReconnect();
        }
    }

    closeSocket(socket) {
        if (!socket) return;
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
            socket.close(1000, 'ChatDisplay connection replaced or stopped');
        }
    }

    clearConnectionTimeout() {
        if (this.connectionTimeoutTimer !== null) {
            clearTimeout(this.connectionTimeoutTimer);
            this.connectionTimeoutTimer = null;
        }
    }

    handleMessage(event) {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.error('Invalid ChatDisplay message', error);
            return;
        }

        // 방송 시간 등의 제어 메시지는 채팅 복구 위치를 갱신하지 않는다.
        if (data.messageType === 'response_broad_time') {
            this.chatMemoController.handleBroadTime(data.btime);
            return;
        }
        if (data.messageType === 'pong') return;
        if (data.messageId && this.seenMessageIds.has(data.messageId)) return;

        let html;
        switch (data.messageType) {
            case config.PLATFORM_TYPE.CHZZK:
                html = this.chzzkFormatter.format(data);
                break;
            case config.PLATFORM_TYPE.SOOP:
                html = this.soopFormatter.format(data);
                break;
            case config.PLATFORM_TYPE.TWITCH:
                html = this.twitchFormatter.format(data);
                break;
            default:
                return;
        }
        html = this.applyColorToMessage(html, data);
        this.addMessageToChat(html);

        if (data.messageId) {
            this.seenMessageIds.add(data.messageId);
            if (this.seenMessageIds.size > 10000) {
                this.seenMessageIds.delete(this.seenMessageIds.values().next().value);
            }
        }
        if (data.timestamp) {
            this.lastMessageTime = Math.max(this.lastMessageTime || 0, data.timestamp);
        }
    }

    requestMissedMessages() {
        this.ws.send(JSON.stringify({
            messageType: 'request_missed_messages',
            lastSeen: this.lastMessageTime || 0
        }));
    }

    startKeepalive() {
        this.clearKeepaliveTimer();
        
        this.keepaliveTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    messageType: 'ping',
                    timestamp: Date.now()
                }));
            }
        }, config.CHAT_DISPLAY.KEEPALIVE_INTERVAL);
    }

    resetKeepaliveTimer() {
        // Keep-Alive 응답 수신 시 타이머 리셋
        this.clearKeepaliveTimer();
        this.startKeepalive();
    }
 
    clearKeepaliveTimer() {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
    }
 
    schedulePreemptiveReconnect() {
        this.clearReconnectTimer();
        
        // 4분 30초 후에 예방적 재연결
        this.reconnectTimer = setTimeout(() => {
            console.log('Starting scheduled ChatDisplay reconnection');
            this.startPreemptiveReconnect();
        }, config.CHAT_DISPLAY.PREEMPTIVE_RECONNECT_DELAY);
    }
 
    startPreemptiveReconnect() {
        if (this.destroyed || this.pendingWs || this.retryTimer !== null) return;
        this.clearReconnectTimer();
        this.connectWebSocket(true);
    }

    attemptReconnect() {
        if (this.destroyed || this.pendingWs || this.retryTimer !== null ||
            this.ws?.readyState === WebSocket.OPEN) return;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.connectWebSocket();
        }, delay);
    }

    clearRetryTimer() {
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
    }

    clearTimers() {
        this.clearKeepaliveTimer();
        this.clearReconnectTimer();
        this.clearRetryTimer();
        this.clearConnectionTimeout();
    }
 
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    addMessageToChat(html) {
        
        const chatMessages = document.getElementById('chat-messages');

        if (chatMessages.children.length >= config.MAX_MESSAGES) {
            chatMessages.removeChild(chatMessages.firstChild);
        }

        chatMessages.insertAdjacentHTML('beforeend', html);

        // 자동 스크롤이 활성화된 경우에만 아래로 스크롤
        if (this.autoScrollEnabled) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // 각 플랫폼에서 받은 색상을 보정 없이 닉네임에 적용한다.
    applyColorToMessage(html, chatData) {
        const color = this.getNicknameColor(chatData);
        if (!color) return html;

        return html.replace(
            /<div class="chat-message-nickname"(.*?)>/,
            `<div class="chat-message-nickname" style="color: ${color}"$1>`
        );
    }

    getNicknameColor(chatData) {
        let color;
        switch (chatData.messageType) {
            case config.PLATFORM_TYPE.CHZZK:
                return this.getChzzkNicknameColor(chatData);
            case config.PLATFORM_TYPE.SOOP: {
                const sourceColor = this.normalizeNicknameColor(chatData.nicknameColor);
                return SOOP_DARK_NICKNAME_COLORS.get(sourceColor?.toUpperCase()) || sourceColor;
            }
            case config.PLATFORM_TYPE.TWITCH:
                color = chatData.color;
                break;
            default:
                return null;
        }

        return this.normalizeNicknameColor(color);
    }

    getChzzkNicknameColor(chatData) {
        let profile = chatData.profile;
        if (typeof profile === 'string') {
            try {
                profile = JSON.parse(profile);
            } catch {
                return null;
            }
        }
        if (!profile || typeof profile !== 'object') return null;

        // 운영자 등의 타이틀 색상은 사용자가 선택한 닉네임 색상보다 우선한다.
        const titleColor = this.normalizeNicknameColor(profile.title?.color);
        if (titleColor) return titleColor;

        const code = profile.streamingProperty?.nicknameColor?.colorCode;
        const role = String(profile.userRoleCode || '').toUpperCase();
        const hasRoleColor = ['STREAMER', 'MANAGER', 'STREAMING_CHANNEL_MANAGER', 'STREAMING_CHAT_MANAGER'].includes(role);
        if (!hasRoleColor) {
            const selectedColor = CHZZK_COLOR_CODES.get(code) || this.normalizeNicknameColor(code);
            if (selectedColor) return selectedColor;
        }

        // CC000(선택 해제), 미지정/알 수 없는 코드는 공식 기본 색상 규칙을 따른다.
        // 방송 채널 ID가 아니라 메시지의 채팅방 ID(cid)를 사용해야 같은 색상이 나온다.
        const userId = String(profile.userIdHash || chatData.userId || chatData.uid || '');
        const chatChannelId = String(chatData.cid || '');
        let sum = 0;
        for (let i = 0; i < userId.length; i++) sum += userId.charCodeAt(i);
        for (let i = 0; i < chatChannelId.length; i++) sum += chatChannelId.charCodeAt(i);
        return CHZZK_DEFAULT_COLORS[sum % CHZZK_DEFAULT_COLORS.length];
    }

    normalizeNicknameColor(color) {
        // 허용한 HEX 값만 삽입하고 플랫폼 색상의 밝기/채도는 변경하지 않는다.
        if (typeof color !== 'string') return null;
        const hex = color.trim().replace(/^#/, '');
        if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) return null;
        return `#${hex}`;
    }

    destroy() {
        this.destroyed = true;
        this.clearTimers();
        this.closeSocket(this.pendingWs);
        this.closeSocket(this.ws);
        this.pendingWs = null;
        this.ws = null;
        this.isReconnecting = false;
        this.seenMessageIds.clear();
    }
}
