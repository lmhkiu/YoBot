// 기본적으로 3사의 scrapper들을 관리하고, 하나의 ChatReceiver와 통신을 한다.
// 3사의 채팅 서버와 통신하는 입장에서는 client이지만, 
// ChatBot 시스템에서는 로컬 index.html 과 통신하는 server의 역할이다.

import ChzzkScraper from './chzzk/ChzzkScrapper.js';
import SoopScraper from './soop/SoopScrapper.js';
import TwitchScrapper from './twitch/TwitchScrapper.js';
import config from '../../../config.js';
import { WebSocketServer } from 'ws';

export default class ChatHub {

    constructor() {
        this.chzzkScrapper = null;
        this.soopScrapper = null;
        this.twitchScrapper = null;
        this.wss = null;
        this.clients = [];


        this.messageBuffer = new Map(); // messageId → message
        this.clientLastSeen = new Map(); // client → timestamp
        this.maxBufferSize = 1000;
    
    }

    async init() {


        //포메터와 통신할 소켓 생성
        await this.createWebSocketDisplay();

        //채팅 스크래퍼 초기화
        this.chzzkScrapper = new ChzzkScraper();
        await this.chzzkScrapper.init(this);

        this.soopScrapper = new SoopScraper();
        await this.soopScrapper.init(this);

        this.twitchScrapper = new TwitchScrapper();
        await this.twitchScrapper.init(this);

        await this.chzzkScrapper.connectToChzzkChat();
        await this.soopScrapper.connectToSoopChat();
        await this.twitchScrapper.connectToTwitchChat();


    }

    getBroadcastDate() {
        return this.soopScrapper.getBroadcastDate();
    }

    //포메터와 통신할 소켓, scarpper가 서버가 된다. 치지직 채팅 서버 연결은 클라이언트지만.
    //클라이언트와 통신할 소켓 생성 함수
    async createWebSocketDisplay() {
        this.wss = new WebSocketServer({ port: config.PORT.CHAT_DISPLAY });

        this.wss.on('connection', (ws) => {
            console.log('chatDisplay 클라이언트 연결됨');
            this.clients.push(ws);

            this.clientLastSeen.set(ws, 0);

        
            ws.on('message', (message) => {
                
                const data = JSON.parse(message);
                console.log('chatDisplay 메시지 수신:', data);
                switch (data.messageType) {
                    case 'request_broad_time':
                        // 방송 시간 정보 전송
                        this.soopScrapper.sendBroadTime();
                        break;

                    case 'ping':
                        // Keep-Alive 응답
                        ws.send(JSON.stringify({
                            messageType: 'pong',
                            timestamp: Date.now()
                        }));
                        break;
                    case 'request_missed_messages':
                        // 누락된 메시지 전송
                        this.sendMissedMessages(ws, data.lastSeen);
                        break;
                    case 'shutdown':
                        // 서버 종료
                        this.onShutdownCallback();
                        break;
                    default:
                        console.log('알 수 없는 메시지 타입:', data.messageType);
                        break;
                }
            });


            ws.on('close', () => {
                console.log('chatDisplay 클라이언트 연결 종료');
                this.clients = this.clients.filter(client => client !== ws);

                // 마지막 확인 시간 기록
                this.clientLastSeen.delete(ws);

                // 모든 클라이언트가 연결 종료되었을 때 server.js의 shutdown 호출
                if (this.clients.length === 0) {
                    console.log('모든 클라이언트 연결 종료');
                    
                    console.log('모든 클라이언트 연결 종료 - 5초 후 shutdown 예약');
                    this.scheduleShutdown();
                }
            });

            ws.on('error', () => {
                console.log('chatDisplay 클라이언트 에러');
                this.clients = this.clients.filter(client => client !== ws);
            });
        });

    

        console.log(`WebSocket 서버 대기 중: ws://localhost:${config.PORT.CHAT_DISPLAY}`);

    }
    // shutdown 스케줄링 메서드
    scheduleShutdown() {
        this.cancelShutdownTimer(); // 기존 타이머 취소
        this.shutdownTimer = setTimeout(() => {
            if (this.clients.length === 0 && this.onShutdownCallback) {
                console.log(`${config.SERVER.SHUTDOWN_DELAY}ms 경과 - shutdown 실행`);
                this.onShutdownCallback();
            }
        }, config.SERVER.SHUTDOWN_DELAY);
    }
    
    // 타이머 취소 메서드
    cancelShutdownTimer() {
        if (this.shutdownTimer) {
            clearTimeout(this.shutdownTimer);
            this.shutdownTimer = null;
        }
    }

    // 메시지 브로드캐스트
    broadcast(message) {
        console.log('ChatHub clients count:', this.clients.length);
        console.log('Broadcasting message:', message);

        const messageWithId = {
            ...message,
            messageId: this.generateMessageId(),
            timestamp: Date.now()
        };

        // 버퍼에 메시지 저장
        this.messageBuffer.set(messageWithId.messageId, messageWithId);
 
        // 오래된 메시지 정리
        this.cleanupOldMessages();

        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(messageWithId));
                this.clientLastSeen.set(client, Date.now());
            }
        });
    }

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
 
    cleanupOldMessages() {
        const fiveMinutesAgo = Date.now() - config.CHAT_DISPLAY.MESSAGE_BUFFER_DURATION;
        
        for (const [messageId, message] of this.messageBuffer) {
            if (message.timestamp < fiveMinutesAgo) {
                this.messageBuffer.delete(messageId);
            }
        }
    }

    // 클라이언트 재연결 시 누락된 메시지 전송
    sendMissedMessages(client, lastSeenTime = 0) {
        const lastSeen = lastSeenTime || this.clientLastSeen.get(client) || 0;
        
        const missedMessages = Array.from(this.messageBuffer.values())
            .filter(msg => msg.timestamp > lastSeen)
            .sort((a, b) => a.timestamp - b.timestamp);
 
        if (missedMessages.length > 0) {
            console.log(`Sending ${missedMessages.length} missed messages to client`);
            
            missedMessages.forEach(msg => {
                client.send(JSON.stringify(msg));
            });
        }
    }

    setShutdownCallback(callback) {
        this.onShutdownCallback = callback;
    }

    destroy() {
        console.log('ChatHub 자원 해제 시작...');
        
        // 각 스크래퍼 WebSocket 연결 종료
        // 각 스크래퍼의 destroy 메서드 호출
        if (this.chzzkScrapper && this.chzzkScrapper.destroy) {
            this.chzzkScrapper.destroy();
        }
        if (this.soopScrapper && this.soopScrapper.destroy) {
            this.soopScrapper.destroy();
        }
        if (this.twitchScrapper && this.twitchScrapper.destroy) {
            this.twitchScrapper.destroy();
        }
        
        // WebSocket 서버 종료
        if (this.wss) {
            this.wss.close();
        }
        
        console.log('ChatHub 자원 해제 완료');
    }

}
