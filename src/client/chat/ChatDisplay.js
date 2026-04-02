// scrapper 서버에서 가져온 채팅을 수신하는 client.
// 수신한 채팅들을 각 플랫폼 별 formatter를 사용하여 chat conatiner에 추가한다.

import config from '../../config.js';
import ChzzkFormatter from './chzzk/ChzzkFormatter.js';
import SoopFormatter from './soop/SoopFormatter.js';
import TwitchFormatter from './twitch/TwitchFormatter.js';

export default class ChatDisplay {

    constructor() {
        this.chatContainer = null;
        this.ws = null;
        this.chzzkFormatter = null;
        this.soopFormatter = null;
        this.twitchFormatter = null;

        // 사용자 색상 캐시 (일관된 색상 유지)
        this.userColorCache = new Map();

        this.chatMemoController = null;
        this.autoScrollEnabled = true;

        // 탭 쓰로틀링(비활성 탭 멈추는 현상) 방지
        this.connectionStartTime = null;
        this.keepaliveTimer = null;
        this.reconnectTimer = null;
        this.isReconnecting = false;
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

    connectWebSocket() {
        this.connectionStartTime = Date.now();
        this.ws = new WebSocket(`ws://localhost:${config.PORT.CHAT_DISPLAY}`);
        
        this.ws.onopen = () => {
            console.log('ChatDisplay connected to server');
            
            this.reconnectAttempts = 0;
            this.isReconnecting = false;

            // Keep-Alive 시작 (10초 간격)
            this.startKeepalive();

            // 예방적 재연결 스케줄링 (4분 30초 후)
            this.schedulePreemptiveReconnect();

            // 서버에 방송 시간 정보 요청
            this.ws.send(JSON.stringify({
                messageType: 'request_broad_time'
            }));

            this.requestMissedMessages();

        };

        this.ws.onclose = (event) => {
            console.log('ChatDisplay disconnected from server', event);
            
            if (event.code !== 1000) { // 정상 종료가 아닌 경우
                console.log('ChatDisplay 소켓 연결이 close되었습니다.');
                //window.close();
                this.attemptReconnect();
            }
        };

       
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("Received message:", data);
           

            // 마지막 메시지 시간 기록
            if (data.messageId && data.timestamp) {
                this.lastMessageTime = data.timestamp;
            }
            
            let html = '';
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
                case 'response_broad_time':
                    this.chatMemoController.handleBroadTime(data.btime);
                    break;
                case 'pong':
                    // Pong 메시지는 처리하지 않음
                    this.resetKeepaliveTimer();
                    break;
            }

            // ChatDisplay에서 색상 처리
            html = this.applyColorToMessage(html, data);

            this.addMessageToChat(html);
        };
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
            console.log('Starting preemptive reconnect (30s before browser throttling)');
            this.startPreemptiveReconnect();
        }, config.CHAT_DISPLAY.PREEMPTIVE_RECONNECT_DELAY);
    }
 
    startPreemptiveReconnect() {
        if (this.isReconnecting) return;
        
        this.isReconnecting = true;
        const newWs = new WebSocket(`ws://localhost:${config.PORT.CHAT_DISPLAY}`);
        
        newWs.onopen = () => {
            console.log('Preemptive reconnection successful');
            
            // 새 연결 안정화 후 기존 연결 종료
            if (this.ws) {
                this.ws.close();
            }
            this.ws = newWs;
            this.isReconnecting = false;
            this.connectionStartTime = Date.now();
            
            // 새 연결에서 Keep-Alive 재시작
            this.startKeepalive();
            this.schedulePreemptiveReconnect();
        };
        
        newWs.onerror = () => {
            console.log('Preemptive reconnection failed, keeping old connection');
            this.isReconnecting = false;

            // 실패 시 attemptReconnect()로 대체
            this.attemptReconnect();
        };
    }
 
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            this.connectWebSocket();
        }, delay);
    }
 
    clearTimers() {
        this.clearKeepaliveTimer();
        this.clearReconnectTimer();
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

    // 통합 색상 처리 메서드
    applyColorToMessage(html, chatData) {
        const userId = chatData.userId;


        // 사용자별 일관된 색상 생성 또는 가져오기
        let userColor = this.getUserColor(userId);

        // HTML에서 닉네임 부분에 색상 적용
        html = html.replace(
            /<div class="chat-message-nickname"(.*?)>/,
            `<div class="chat-message-nickname" style="color: ${userColor}"$1>`
        );

        return html;
    }

    // 사용자별 색상 생성/관리
    getUserColor(userId) {
        // 이미 캐시된 색상이 있으면 반환
        if (this.userColorCache.has(userId)) {
            return this.userColorCache.get(userId);
        }

        let finalColor;

        finalColor = this.generatePastelColor(userId);

        // 캐시에 저장
        this.userColorCache.set(userId, finalColor);

        return finalColor;
    }

    // 사용자 ID 기반 파스텔 톤 색상 생성
    generatePastelColor(userId) {

        if(userId === null || userId === undefined || userId === '' || userId.length == 0) {
            return '#ffffff';
        }
        
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
            hash = userId.charCodeAt(i) + ((hash << 5) - hash);
        }

        const hue = Math.abs(hash) % 360;
        const saturation = 60 + (Math.abs(hash >> 8) % 20); // 60-80%
        const lightness = 65 + (Math.abs(hash >> 16) % 15); // 65-80%

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    // 어두운 배경에 맞게 색상 조정
    adjustColorForDarkBackground(color) {
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);

            // 밝기 계산
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;

            // 너무 어두우면 파스텔 색상으로 대체
            if (brightness < 100) {
                return this.generatePastelColor(color);
            }
        }

        return color;
    }

    destroy() {
        this.clearTimers();
        if (this.ws) {
            this.ws.close();
        }
        this.userColorCache.clear(); // 이 줄 추가
    }
}