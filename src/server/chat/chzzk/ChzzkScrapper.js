// ChzzkScrapper.js

import BaseChatScrapper from '../BaseChatScrapper.js';
import config from '../../../../config.js';

export default class ChzzkScrapper extends BaseChatScrapper {
    constructor() {
        super();

        this.chatChannelId = null;
        this.accessToken = null;
        this.chzzkWs = null;
        this.chatHub = null;
  
    }

    async init(chatHub) {
        this.chatHub = chatHub;
     
        //그리고 치지직 채팅 서버 연결
        
    }


  

    // Chzzk WebSocket 연결 함수
    async connectToChzzkChat() {

        if (this.chzzkWs) {
            this.chzzkWs.close();
            this.chzzkWs = null;
        }

        this.chatChannelId = null;
        this.accessToken = null;

        this.chatChannelId = await this.getChatChannelId(config.CHZZK.CHANNEL_ID);
        this.accessToken = await this.getChatChannelAccessToken(this.chatChannelId);

        if (!this.chatChannelId || !this.accessToken) {
            //console.error('chatChannelId 또는 accessToken 없음');
            throw new Error('chatChannelId 또는 accessToken 없음');
        }

        //WebSocket 생성 하는 순간 연결이 시작된다. 이때 연결은 비동기 식으로 이벤트 루프에서 처리한다.
        // 따라서 생성자는 인스턴스를 반환하여 사용가능한 상태이지만, 아직 연결은 진행되지 않는다.
        this.chzzkWs = new WebSocket(config.CHZZK.WS_URL);

        this.chzzkWs.onopen = this.onSocketOpen.bind(this);
        this.chzzkWs.onmessage = this.onSocketMessage.bind(this);
        this.chzzkWs.onclose = this.onSocketClose.bind(this);
        this.chzzkWs.onerror = this.onSocketError.bind(this);

    }

    onSocketOpen = (event) => {
        console.log('Chzzk WebSocket 연결 성공', event);
        // 인증 메시지 전송
        const authMessage = {
            ver: "2",
            cmd: 100,
            svcid: "game",
            cid: this.chatChannelId,
            bdy: {
                uid: null,
                devType: 2001,
                accTkn: this.accessToken,
                auth: "READ"
            },
            tid: 1
        };
        this.chzzkWs.send(JSON.stringify(authMessage));
    }


        // 채팅 메시지 수신 {
        //     svcid: 'game',
        //     cid: 'N2KB4R',
        //     mbrCnt: 2704,
        //     uid: '6fef65f641dbe662c6933463eac94ab2',
        //     profile: '{"userIdHash":"6fef65f641dbe662c6933463eac94ab2","nickname":"HoneyBEES","profileImageUrl":"","userRoleCode":"common_user","badge":null,"title":null,"verifiedMark":false,"activityBadges":[],"streamingProperty":{"nicknameColor":{"colorCode":"CC000"},"activatedAchievementBadgeIds":[]},"viewerBadges":[]}',
        //     msg: '!투표 1',
        //     msgTypeCode: 1,
        //     msgStatusType: 'NORMAL',
        //     extras: '{"extraToken":"t2OoTmNxIH0mFuyyEqV4W5UJFrMQi\\/ALtd\\/897zqQtDq7ho8VEf+1vSL050C9aIRRT6y\\/juk\\/aCwr+b1tYtDxQ==","osType":"IOS","chatType":"STREAMING","streamingChannelId":"dc7fb0d085cfbbe90e11836e3b85b784"}',
        //     ctime: 1772164980262,
        //     utime: 1772164980262,
        //     msgTid: null,
        //     cuid: null,
        //     msgTime: 1772164980262
        // }


    onSocketMessage = (event) => {

        //console.log('Chzzk WebSocket 메시지', event);
        //console.log('Chzzk 메시지 수신:', event.data);
        // 메시지 파싱 및 처리 (필요시 추가)
        const json = JSON.parse(event.data);
        
        switch (json.cmd) {
            case 0: // PING
                console.log('Chzzk PING 메시지 수신:', json);
                this.chzzkWs.send(JSON.stringify({ ver: '2', cmd: 10000 })); // PONG
                console.log('Chzzk PONG 메시지 전송:', { ver: '2', cmd: 10000 });
                break;
            case 93101: // CHAT
            case 93102: // CHEESE_CHAT
                // 채팅 메시지 처리
                json.bdy.forEach(chat => {
                    if (chat.msgTypeCode === 1 || chat.msgTypeCode === 2) { // 일반 채팅 또는 치즈 채팅
                        chat.platformType = config.PLATFORM_TYPE.CHZZK;
                        //console.log("Chzzk 채팅", chat);
                        chat.userId = chat.uid; 

                        this.chatHub.broadcast(chat);
                        
                    } else {
                        //console.log("Chzzk CHAT, CHEESE_CHAT, 예외 채팅 메시지 수신", chat);
                    }
                });
                break;
            // 기타 케이스...
            default:
                //console.log("Chzzk예외 채팅 메시지 수신", json);
                break;
        }

    }

    onSocketClose = (code, reason) => {

        console.log(`Chzzk WebSocket 연결 종료: ${code} - ${reason}`);
        // 재연결 로직 (필요시)
        // 정상 종료가 아니면 재연결 시도
        // if (code !== 1000) {
        //     console.log("비정상 종료, 토큰 재발급 및 재연결 시도");
        //     this.retryConnection();
        // }
    }

    onSocketError = (event) => {
        console.log('Chzzk WebSocket 에러', event);
    }

    onMessageCallback = (message) => {
        console.log(`${message.nickname}:${message.content}`);
        //console.log("*****", message);
    }


    async retryConnection() {
        console.log("재연결 시도");
        setTimeout(async () => {
            try {
                await this.connectToChzzkChat();
            } catch (error) {
                console.error('Error:', error);
            }
        }, 5000);


    }


    // 자신이 선언한 함수 예시
    async getChatChannelId(chzzkChannelId) {
        try {
            const url = `https://api.chzzk.naver.com/polling/v2/channels/${chzzkChannelId}/live-status`;
            //console.log("chatChannelId URL:", url);
            const response = await fetch(url, {
                headers: {
                    Origin: 'https://chzzk.naver.com'
                }
            });
            console.log("chatChannelId response:", response);
            const data = await response.json();

            console.log("chatChannelId data:", data);
            return data.content.chatChannelId;
        } catch (error) {
            console.error('Error:', error);
            return null;
        }
    }

    // accessToken 가져오는 함수
    async getChatChannelAccessToken(chatChannelId) {
        try {
            const url = `https://comm-api.game.naver.com/nng_main/v1/chats/access-token?channelId=${chatChannelId}&chatType=STREAMING`;
     
            const response = await fetch(url, {
                headers: {
                    Origin: 'https://chzzk.naver.com'
                }
            });
            const data = await response.json();
            console.log("accessToken data:", data);
            return data.content.accessToken;
        } catch (error) {
            console.error('AccessToken Error:', error);
            return null;
        }
    }


    destroy() {
        console.log('ChzzkScrapper 자원 해제...');
        if (this.chzzkWs) {
            this.chzzkWs.close();
            this.chzzkWs = null;
        }
    }
    
}
