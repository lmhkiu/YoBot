import BaseChatScrapper from '../BaseChatScrapper.js';
import config from '../../../../config.js';
import WebSocket from 'ws';

export default class TwitchScrapper extends BaseChatScrapper {
    constructor() {
        super();
        this.twitchWs = null;
        this.chatHub = null;
        this.reconnectInterval = null;
    }

    async init(chatHub) {
        this.chatHub = chatHub;
    }

    async connectToTwitchChat() {
        try {
            if (this.twitchWs) {
                this.twitchWs.close();
                this.twitchWs = null;
            }

            const channelId = config.TWITCH.CHANNEL_ID;
            if (!channelId) {
                throw new Error('Twitch 채널 ID가 설정되지 않았습니다.');
            }

            console.log('[TWITCH] Starting connection for channel:', channelId);

            // Twitch IRC WebSocket 연결
            this.twitchWs = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

            this.twitchWs.onopen = this.onSocketOpen.bind(this);
            this.twitchWs.onmessage = this.onSocketMessage.bind(this);
            this.twitchWs.onclose = this.onSocketClose.bind(this);
            this.twitchWs.onerror = this.onSocketError.bind(this);

        } catch (error) {
            console.error('[TWITCH] Connection setup error:', error);
            throw error;
        }
    }

    onSocketOpen(event) {
        console.log('[TWITCH] WebSocket 연결 성공');

        // 익명 접속 - 인증 없이 채팅 수신만 가능
        this.twitchWs.send('CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands');
        this.twitchWs.send('PASS oauth:'); // 익명 접속용 빈 OAuth 토큰
        this.twitchWs.send('NICK justinfan12345'); // 표준 익명 사용자명
        this.twitchWs.send(`JOIN #${config.TWITCH.CHANNEL_ID.toLowerCase()}`);

        // PING-PONG 유지
        this.reconnectInterval = setInterval(() => {
            if (this.twitchWs && this.twitchWs.readyState === WebSocket.OPEN) {
                this.twitchWs.send('PING');
            }
        }, 300000); // 5분마다 PING
    }

    onSocketMessage(event) {
        console.log('[TWITCH] WebSocket 메시지:', event.data.toString());
        const messages = event.data.toString().split('\r\n');

        messages.forEach(message => {
            if (!message.trim()) return;

            //console.log('[TWITCH] Raw message:', message);

            // PING 응답
            if (message === 'PING :tmi.twitch.tv') {
                this.twitchWs.send('PONG :tmi.twitch.tv');
                return;
            }

            // 채팅 메시지 파싱
            if (message.includes('PRIVMSG')) {
                const chat = this.parseChatMessage(message);
                if (chat) {
                    this.chatHub.broadcast(chat);
                }
            }
        });
    }


    //[TWITCH] Raw message: @badge-info=subscriber/60;badges=broadcaster/1,subscriber/0;client-nonce=373f81b5062b438889d492136ac8c0a9;color=#008000;display-name=우유함유;emotes=;first-msg=0;flags=;id=9e39b6bf-6bde-42f9-8389-61b9724fb57e;mod=0;returning-chatter=0;room-id=479119137;subscriber=1;tmi-sent-ts=1772600411556;turbo=0;user-id=479119137;user-type= :lmhki!lmhki@lmhki.tmi.twitch.tv PRIVMSG #lmhki :dddd
    parseChatMessage(message) {
        try {
            // Twitch IRC 메시지 파싱
            // @badge-info=subscriber/60;badges=broadcaster/1,subscriber/0;... :lmhki!lmhki@lmhki.tmi.twitch.tv PRIVMSG #lmhki :dddd
            const tagsMatch = message.match(/^@(.+?) :(.+?)!.+? PRIVMSG #(.+?) :(.+)$/);
            if (!tagsMatch) return null;

            const [, tags, username, channel, content] = tagsMatch;

            // 태그 정보 파싱
            const tagMap = {};
            tags.split(';').forEach(tag => {
                const [key, value] = tag.split('=');
                tagMap[key] = value;
            });

            return {
                platformType: config.PLATFORM_TYPE.TWITCH,
                userId: tagMap['user-id'] || username,
                nickname: tagMap['display-name'] || username,
                content: content,
                msgTime: Date.now(),
                color: tagMap['color'],
                badges: tagMap['badges'],
                // 추가 유용한 정보들
                // 이모티콘 정보 추가
                emotes: tagMap['emotes'], // "30259:0-6,12345:8-13"
                subscriber: tagMap['subscriber'] === '1',
                moderator: tagMap['mod'] === '1',
                turbo: tagMap['turbo'] === '1',
                roomId: tagMap['room-id'],
                messageId: tagMap['id']
            };
        } catch (error) {
            console.error('[TWITCH] Message parsing error:', error);
            return null;
        }
    }

    onSocketClose(event) {
        console.error(`[TWITCH] WebSocket 연결 종료 - Code: ${event.code}, Reason: ${event.reason}`);

        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
        }

        
    }

    onSocketError(event) {
        console.error('[TWITCH] WebSocket 에러:', event);
    }

    destroy() {
        console.log('TwitchScrapper 자원 해제...');

        // 1. 먼저 재연결 타이머 정리
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }

        // 2. 그 다음 WebSocket 종료
        if (this.twitchWs) {
            this.twitchWs.close();
            this.twitchWs = null;
        }
    }
}