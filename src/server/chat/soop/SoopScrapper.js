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
            this.chatInfoCache = {};
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

        if (!res.CHANNEL.CHDOMAIN && this.chatInfoCache[channelId]) {
            console.log('Using cached chatInfo for', channelId);
            chatInfo = this.chatInfoCache[channelId];
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
            this.chatInfoCache[channelId] = chatInfo;
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
            platformType: 'broad_time',
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
                platformType: config.PLATFORM_TYPE.SOOP,
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
                platformType: config.PLATFORM_TYPE.SOOP,
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
                platformType: config.PLATFORM_TYPE.SOOP,
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
            //setTimeout(() => this.connectToSoopChat(), 5000);
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




    /**

parts[0]:       00500008500
parts[1]: ㅇㅇ/샤방/ㅇㅇ
parts[2]: lmhkiu
parts[3]: 0
parts[4]: 0
parts[5]: 3
parts[6]: 주눈비
parts[7]: 65536|163840
parts[8]: -1
parts[9]: 6518C8
parts[10]: 9568CD
parts[11]: -1
parts[12]: -1
parts[13]:
parts[14]: -1
parts[15]:

Soop WebSocket 채팅: {
  platformType: 'soop',
  userID: 'lmhkiu',
  nickname: '주눈비',
  content: 'ㅇㅇ/샤방/ㅇㅇ',
  type: 'text',
  msgTime: 1773122714886
}



Soop WebSocket 메시지: [
  '\x1B\t000500007100', 'ㅇㅇ',
  'lmhkiu',             '0',
  '0',                  '3',
  '주눈비',             '65536|163840',
  '-1',                 'DC3585',
  'CF5F9B',             '-1',
  '-1',                 '',
  '-1',                 ''
]
parts[0]:       00500007100
parts[1]: ㅇㅇ
parts[2]: lmhkiu
parts[3]: 0
parts[4]: 0
parts[5]: 3
parts[6]: 주눈비
parts[7]: 65536|163840
parts[8]: -1
parts[9]: DC3585
parts[10]: CF5F9B
parts[11]: -1
parts[12]: -1
parts[13]:
parts[14]: -1
parts[15]:
Soop WebSocket 채팅: {
  platformType: 'soop',
  userID: 'lmhkiu',
  nickname: '주눈비',
  content: 'ㅇㅇ',
  type: 'text',
  msgTime: 1773126550546
}





parts[0]:       00500008500
parts[1]: ㅇㅇ/샤방/ㅇㅇ
parts[2]: lmhkiu
parts[3]: 0
parts[4]: 0
parts[5]: 3
parts[6]: 주눈비
parts[7]: 65536|163840
parts[8]: -1
parts[9]: 6518C8
parts[10]: 9568CD
parts[11]: -1
parts[12]: -1
parts[13]:
parts[14]: -1
parts[15]:


parts[0]:       00500007100
parts[1]: ㅇㅇ
parts[2]: lmhkiu
parts[3]: 0
parts[4]: 0
parts[5]: 3
parts[6]: 주눈비
parts[7]: 65536|163840
parts[8]: -1
parts[9]: DC3585
parts[10]: CF5F9B
parts[11]: -1
parts[12]: -1
parts[13]:
parts[14]: -1
parts[15]:




//스티커
<img class="emoticon" src="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/5fe53f42edb76/10_80.png?ver=1" data-default-img="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/5fe53f42edb76/10_80.png?ver=1" data-static-img="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/5fe53f42edb76/10_80.png?ver=1" alt="OGQ 이모티콘 이미지" onerror="this.onerror=null;this.src='https://res.sooplive.co.kr/images/chat/ogq_default.svg'">

parts[0]:       10900009900
parts[1]: 3995
parts[2]: ㅇㅇ
parts[3]: 5fe53f42edb76
parts[4]: 10
parts[5]: 1
parts[6]: lmhkiu
parts[7]: 주눈비
parts[8]: 65536|163840
parts[9]: 0
parts[10]: 3
parts[11]:
parts[12]: png
parts[13]: -1
parts[14]: DC3585
parts[15]: CF5F9B
parts[16]: -1
parts[17]: -1
parts[18]: 0
parts[19]: -1
parts[20]:


/// 도네이션 10개
parts[0]:       01800011500
parts[1]: danz59
parts[2]: shyeond
parts[3]: 두부졸림
parts[4]: 10
parts[5]: 0
parts[6]: 0
parts[7]: 9552
parts[8]: 10
parts[9]: 0
parts[10]: 0
parts[11]: kor_custom07
parts[12]: 01fbe3ff-81f2-44b1-a8dd-2eb8348c28f5
parts[13]: ko_KR
parts[14]: 1771461483
parts[15]:
Soop WebSocket 채팅: {
  platformType: 'soop',
  userId: 'shyeond',
  nickname: '0',
  content: 'danz59',
  type: 'text',
  userFlag: '9552',
  nicknameColor: '0',
  msgTime: 1773208175407
}


<div class="chatting-list-item" user-type=""><div class="donation-container"><div class="donation-bubble"><div class="ceremony-img custom-mobile-img"><img src="https://res.sooplive.co.kr/new_player/items/m_balloon_10.png?v=1771461483" alt="별풍선"></div><div class="info-box"><button type="button" class="name" user_id="shyeond" user_nick="두부졸림">두부졸림</button><span class="money">별풍선 <em>10</em>개</span></div></div></div></div>


////도네이션 5개  
parts[0]:       01800012000
parts[1]: jrdart
parts[2]: wordyong
parts[3]: 거지왕리지상
parts[4]: 5
parts[5]: 0
parts[6]: 0
parts[7]: 2604
parts[8]: 5
parts[9]: 0
parts[10]: 0
parts[11]: kor_custom10
parts[12]: de33f821-ed04-41e1-bc47-37adfabb32ad
parts[13]: ko_KR
parts[14]: 1672402477
parts[15]:
Soop WebSocket 채팅: {
  platformType: 'soop',
  userId: 'wordyong',
  nickname: '0',
  content: 'jrdart',
  type: 'text',
  userFlag: '2604',
  nicknameColor: '0',
  msgTime: 1773209201200
}


    <div class="chatting-list-item" user-type=""><div class="donation-container"><div class="donation-bubble"><div class="ceremony-img custom-mobile-img"><img src="https://res.sooplive.co.kr/new_player/items/m_balloon_5.png?v=1672402477" alt="별풍선"></div><div class="info-box"><button type="button" class="name" user_id="wordyong" user_nick="거지왕리지상">거지왕리지상</button><span class="money">별풍선 <em>5</em>개</span></div></div></div></div>




    //움직이는 스티커
    <div class="chatting-list-item" user-type="subscribe"><div class="message-container"><div class="username"><button user_id="pnsjo2207" user_nick="메이링vV" userflag="805388800" is_mobile="true" grade="gudok" is_subscriber="true" tiernickname="씩씩이" personalcon="https://static.file.sooplive.co.kr/spcon/243568ce67e613c45.png?_=1758504003" sub-month="1" acc-sub-month="1"><span class="thumb"><img src="https://static.file.sooplive.co.kr/spcon/243568ce67e613c45.png?_=1758504003" alt="프로필 이미지" onerror="this.onerror=null;this.src='https://res.sooplive.co.kr/images/chatting/signature-default.svg'"><span class="tier_tip"><em class="name">씩씩이</em>누적 1개월</span></span><span class="author random-color20" data-color="C40F70">메이링vV</span></button></div><div class="message-text"><div class="emoticon-box " id="0"><a href="https://ogqmarket.sooplive.co.kr/?m=detail&amp;productId=6460cd0322470" target="_blank" tip="구매하기" id="ogq-img" type="button" class="img-box" data-id="6460cd0322470" data-subid="9" data-type="OGQ">
                    <img class="emoticon" src="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/6460cd0322470/9_80.webp?ver=1" data-default-img="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/6460cd0322470/9_80.webp?ver=1" data-static-img="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/6460cd0322470/9_80.png?ver=1" alt="OGQ 이모티콘 이미지" onerror="this.onerror=null;this.src='https://res.sooplive.co.kr/images/chat/ogq_default.svg'">
            </a></div></div></div></div>
    */
