import BaseChatScrapper from '../BaseChatScrapper.js';
import config from '../../../../config.js';
import WebSocket from 'ws';
import fsPromises from 'fs/promises';

export default class SoopScrapper extends BaseChatScrapper {
    constructor() {
        super();
        this.soopWs = null;
        this.chatHub = null;
        this.chatInfo = null;
        this.pingInterval = null;
        this.chatInfoCache = null;
    }

    async init(chatHub) {
        this.chatHub = chatHub;
        this.loadChatInfoCache();
    }
    // 캐시 로드 메서드
    async loadChatInfoCache() {
        try {
            const data = await fsPromises.readFile(config.SOOP.CHAT_INFO_CACHE_FILE, 'utf8');
            this.chatInfoCache = JSON.parse(data);
        } catch (error) {
            this.chatInfoCache = null;
        }
    }
    // 캐시 저장 메서드
    async saveChatInfoCache() {
        try {
            await fsPromises.writeFile(config.SOOP.CHAT_INFO_CACHE_FILE, JSON.stringify(this.chatInfoCache));
            console.log('ChatInfo cache saved successfully', this.chatInfoCache);
        } catch (error) {
            console.error('Failed to save ChatInfo cache:', error);
        }
    }

    async getCurrentBno(channelId) {
        try {
            // 방송 페이지에서 실시간으로 방송 번호 추출
            const response = await fetch(`https://play.sooplive.co.kr/${channelId}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const html = await response.text();

            // 여러 패턴으로 현재 방송 번호 추출
            const patterns = [
                /window\.(?:nBroadNo|requestBroadNo)\s*=\s*(\d+)/,
                /broad_no['":\s]+(\d+)/i,
                /"broad_no":(\d+)/i,
                /\/(\d{9})(?:\?|\/|$)/,  // URL에서 9자리 숫자

            ];

            for (let i = 0; i < patterns.length; i++) {
                const pattern = patterns[i];
                const match = html.match(pattern);
                if (match) {
                    console.log(`Pattern ${i} matched for ${channelId}: full="${match[0]}", number=${match[1]}`);
                    return match[1];
                }
            }

            throw new Error(`No current broadcast found for ${channelId}`);

        } catch (error) {

            return null;
        }
    }

    async getChatInfo(channelId) {

        const bno = await this.getCurrentBno(channelId);

        if (!bno) {
            console.error('No broadcast number found for ' + channelId);
            return null;
        }

        const data = {
            bid: channelId,
            bno: bno,
            type: 'live',
            confirm_adult: 'true',
            player_type: 'html5',
            mode: 'landing',
            from_api: '0',
            pwd: '',
            stream_type: 'common',
            quality: 'HD'
        };
        const response = await fetch(`${config.SOOP.PLAYER_API_URL}?bjid=${channelId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': 'https://play.sooplive.co.kr',
                'Referer': 'https://play.sooplive.co.kr/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            body: new URLSearchParams(data)
        });
        console.log('getChatInfo response', response);
        const res = await response.json();
        console.log('getChatInfo res', res);

        if (!res.CHANNEL) {
            console.error('No channel information found in response');
            return null;
        }
        let chatInfo = null;

        if (!res.CHANNEL.CHDOMAIN && this.chatInfoCache) {
            console.log('Using cached chatInfo for', channelId);
            chatInfo = this.chatInfoCache;
        } else if (res.CHANNEL.CHDOMAIN) {
            console.log('Caching chatInfo for', channelId);
            chatInfo = {
                chdomain: res.CHANNEL.CHDOMAIN.toLowerCase(),
                chatno: res.CHANNEL.CHATNO,
                ftk: res.CHANNEL.FTK,
                title: res.CHANNEL.TITLE,
                bjid: res.CHANNEL.BJID,
                chpt: parseInt(res.CHANNEL.CHPT) + 1,
                btime: res.CHANNEL.BTIME,  // 방송 시간(분) 추가
                startDate: new Date(response.headers.get('date')).toISOString().slice(0,10).replace(/-/g, '')  // 20260326 형식
            };
            this.chatInfoCache = chatInfo;
            await this.saveChatInfoCache();
        }

        if (!chatInfo) {
            console.error('No chatInfo available for', channelId);
            return null;
        }

        return chatInfo;
    }

    getBroadcastDate() {
        if (!this.chatInfo) {
            console.log('No chatInfo available, using current date');
            return new Date().toISOString().split('T')[0].replace(/-/g, ''); // 방송 시작 전이면 현재 날짜
        }
        return this.chatInfo.startDate;
    }

    async connectToSoopChat() {
        try {
            if (this.soopWs) {
                this.soopWs.close();
                this.soopWs = null;
            }
            const channelId = config.SOOP.CHANNEL_ID;
            console.log('[SOOP] Starting connection process for BJ:', channelId);

            this.chatInfo = await this.getChatInfo(channelId);
            if (!this.chatInfo) {
                console.error('No chat info found for ' + channelId);
                return;
            }
            console.log('Soop Chat Info:', this.chatInfo);

            
            const wsUrl = `wss://${this.chatInfo.chdomain}:${this.chatInfo.chpt}/Websocket/${this.chatInfo.bjid}`;
            //console.log('[SOOP] WebSocket URL: ' + wsUrl);
            //console.log('[SOOP] FTK Token:', this.chatInfo.ftk);

            // 프로토콜 방식으로 WebSocket 생성
            this.soopWs = new WebSocket(wsUrl, 'chat');


            this.soopWs.onopen = this.onSocketOpen.bind(this);
            this.soopWs.onmessage = this.onSocketMessage.bind(this);
            this.soopWs.onclose = this.onSocketClose.bind(this);
            this.soopWs.onerror = this.onSocketError.bind(this);

        } catch (error) {
            console.error('[SOOP] Connection setup error:', error);
            console.error('[SOOP] Error details:', {
                message: error.message,
                stack: error.stack,
                chatInfo: this.chatInfo
            });
            throw error;
        }
    }

    sendBroadTime() {
        
        if(!this.chatInfo) {
            console.error('No chat info available');
            return;
        }
        const data = {
            messageType: 'response_broad_time',
            btime: this.chatInfo.btime
        }
        this.chatHub.broadcast(data)
        
    }

    onSocketOpen(event) {
        console.log('Soop WebSocket 연결 성공', event);
        const ESC = '\x1b\t';
        const F = '\x0c';
        const CONNECT_PACKET = `${ESC}000100000600${F}${F}${F}16${F}`;
        const calculateByteSize = (str) => Buffer.byteLength(str, 'utf8') + 6;
        console.log('Soop WebSocket 연결 패킷:', CONNECT_PACKET);
        this.soopWs.send(CONNECT_PACKET);
        setTimeout(() => {
            const JOIN_PACKET = `${ESC}0002${calculateByteSize(this.chatInfo.chatno).toString().padStart(6, '0')}00${F}${this.chatInfo.chatno}${F}${F}${F}${F}${F}`;
            console.log('Soop WebSocket 입장 패킷:', JOIN_PACKET);
            this.soopWs.send(JOIN_PACKET);
        }, 2000);
        this.pingInterval = setInterval(() => {
            const PING_PACKET = `${ESC}000000000100${F}`;
            console.log('Soop WebSocket 핑 패킷:', PING_PACKET);
            this.soopWs.send(PING_PACKET);
        }, 60000);
    }

    printParts(parts) {
        for (let i = 0; i < parts.length; i++) {
            console.log('parts[' + i + ']:', parts[i]);
        }
    }

    onSocketMessage(event) {

        const data = event.data.toString('utf8');
        //console.log('Soop WebSocket 메시지:', data);
        const parts = data.split('\x0c');
        //console.log('Soop WebSocket 메시지:', parts);

        //this.printParts(parts);
        const chat = this.parseMessage(parts);
        //console.log('Soop WebSocket 채팅:', chat);
        if (chat) {
            this.chatHub.broadcast(chat);
        }
    }




    parseMessage(parts) {
        let ret = null;
        if (!parts || parts.length === 0) {
            //console.log('parseMessage called with empty parts');
            return ret;
        }
        parts[0] = parts[0].replace(/[\s\x1B]/g, '');
        //console.log('Char codes:', Array.from(parts[0]).map(c => c.charCodeAt(0)));
        //console.log('parseMessage called with parts[0]:', parts[0], 'length:', parts[0].length);
        // 숲 스티커는 글자와 함께 써도 항상 맨 앞에 온다.
        if (parts.length >= 13 && parts[12] === 'png') {
            // OGQ Emoticon message
            ret = {
                messageType: config.PLATFORM_TYPE.SOOP,
                userId: parts[6],
                nickname: parts[7],
                content: parts[2],
                type: 'sticker',
                stickerId: parts[3],
                stickerNum: parts[4],
                extension: parts[12],
                userFlag: parts[8],
                nicknameColor: parts[14],
                msgTime: Date.now()
            };
        } else if (parts[0] && parts[0].startsWith('0018')) {
            console.log('Donation detected:', parts);
            // Donation message (별풍선 등)


            ret = {
                messageType: config.PLATFORM_TYPE.SOOP,
                userId: parts[2],  // shyeond
                nickname: parts[3],  // 두부졸림
                content: '별풍선', // 기부한 아이템 이름
                type: 'donation',
                amount: parseInt(parts[4]),  // 별풍선 개수 (10)
                donationType: parts[11],  // kor_custom07 (기부 타입)
                userFlag: parts[7],  // 9552
                nicknameColor: parts[5],  // 0 (아마 색상 코드)
                msgTime: parseInt(parts[14]) || Date.now()  // 타임스탬프
            };
        } else if (parts.length < 20 && parts.length > 5 && parts[1] !== '-1' && parts[1] !== '1' && !parts[1].includes('|')) {

            //console.log('Checking donation condition for parts[0]:', parts[0], 'trim():', parts[0]?.trim());
            ret = {
                messageType: config.PLATFORM_TYPE.SOOP,
                userId: parts[2],
                nickname: parts[6],
                content: parts[1],
                type: 'text',

                userFlag: parts[7],
                nicknameColor: parts[9],
                msgTime: Date.now()
            };
        }
        return ret;
    }


    onSocketClose(event) {
        console.error(`[SOOP] WebSocket 연결 종료 - Code: ${event.code}, Reason: ${event.reason}`);
        console.error(`[SOOP] Close code details: ${this.getCloseCodeDescription(event.code)}`);

        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        if (event.code !== 1000) {
            setTimeout(() => this.connectToSoopChat(), 1000);
        }
    }

    onSocketError(event) {
        console.error('[SOOP] WebSocket 에러 이벤트:', event);
        console.error('[SOOP] WebSocket 상태:', this.soopWs?.readyState);
        console.error('[SOOP] 에러 발생 시점:', new Date().toISOString());

        if (this.soopWs) {
            console.error('[SOOP] WebSocket URL:', this.soopWs.url);
            console.error('[SOOP] WebSocket 프로토콜:', this.soopWs.protocol);
        }
    }

    // Add this helper method to describe close codes
    getCloseCodeDescription(code) {
        const codes = {
            1000: 'Normal Closure',
            1001: 'Going Away',
            1002: 'Protocol Error',
            1003: 'Unsupported Data',
            1004: 'Reserved',
            1005: 'No Status Rcvd',
            1006: 'Abnormal Closure',
            1007: 'Invalid frame payload data',
            1008: 'Policy Violation',
            1009: 'Message Too Big',
            1010: 'Mandatory Extension',
            1011: 'Internal Server Error',
            1015: 'TLS Handshake'
        };
        return codes[code] || `Unknown code: ${code}`;
    }

    destroy() {
        console.log('SoopScrapper 자원 해제...');

        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        
        if (this.soopWs) {
            this.soopWs.close();
            this.soopWs = null;
        }
        
    }
}