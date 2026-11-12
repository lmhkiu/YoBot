// 기본적으로 3사의 scrapper들을 관리하고, 하나의 ChatReceiver와 통신을 한다.
// 3사의 채팅 서버와 통신하는 입장에서는 client이지만, 
// ChatBot 시스템에서는 로컬 index.html 과 통신하는 server의 역할이다.

import ChzzkScraper from './chzzk/ChzzkScrapper.js';
import SoopScraper from './soop/SoopScrapper.js';
import TwitchScrapper from './twitch/TwitchScrapper.js';
import config from '../../../config.js';
import PeperoGame from '../game/PeperoGame.js';
import MarbleGame from '../game/MarbleGame.js';
import WebSocket, { WebSocketServer } from 'ws';

export default class ChatHub {

    constructor(historyStore = null) {
        this.historyStore = historyStore;
        this.chzzkScrapper = null;
        this.soopScrapper = null;
        this.twitchScrapper = null;
        this.wss = null;
        this.clients = [];
        this.gameHost = null;
        this.game = null;



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

        // Let the local chat window open even when a platform is offline.
        if (config.CHZZK.CHANNEL_ID) {
            this.chzzkScrapper.connectToChzzkChat().catch(error => console.error('치지직 채팅 연결 실패:', error.message));
        }
        if (config.SOOP.CHANNEL_ID) {
            this.soopScrapper.connectToSoopChat().catch(error => console.error('숲 채팅 연결 실패:', error.message));
        }
        if (config.TWITCH.CHANNEL_ID) {
            this.twitchScrapper.connectToTwitchChat().catch(error => console.error('트위치 채팅 연결 실패:', error.message));
        }


    }

    getBroadcastDate() {
        return this.soopScrapper.getBroadcastDate();
    }

    //포메터와 통신할 소켓, scarpper가 서버가 된다. 치지직 채팅 서버 연결은 클라이언트지만.
    //클라이언트와 통신할 소켓 생성 함수
    async createWebSocketDisplay() {
        this.wss = new WebSocketServer({ port: config.PORT.CHAT_DISPLAY });

        this.wss.on('connection', (ws, request) => {
            this.cancelShutdownTimer();
            const query = new URL(request.url, 'http://localhost').searchParams;
            ws.gameType = query.get('game');
            ws.gameClient = ['pepero', 'marble'].includes(ws.gameType);
            if (ws.gameClient && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) && !this.gameHost) {
                this.gameHost = ws;
                if (!this.game) {
                    const Game = ws.gameType === 'marble' ? MarbleGame : PeperoGame;
                    this.gameType = ws.gameType;
                    this.game = new Game({
                        excludedNicknames: config.CHAT_HISTORY?.EXCLUDED_NICKNAMES,
                        onChange: state => this.sendGameState(state)
                    });
                }
            }
            ws.historyUser = query.get('history') === '1' ? { platform: query.get('platform'), userId: query.get('userId') } : null;
            console.log('chatDisplay 클라이언트 연결됨');
            this.clients.push(ws);
            if (ws.gameClient && this.game) {
                if (ws.gameType !== this.gameType) ws.close(1000, 'Another game is active');
                else this.sendGameState(this.game.snapshot());
            }

            this.clientLastSeen.set(ws, 0);

        
            ws.on('message', (message) => {
                
                let data;
                try { data = JSON.parse(message); } catch { return; }
                if (!data || typeof data !== 'object') return;
                if (data.messageType === 'pepero_action' || data.messageType === 'marble_action') {
                    if (ws === this.gameHost && data.messageType === this.gameType + '_action') {
                        if (data.action === 'leave') {
                            this.game?.destroy();
                            this.game = null;
                            this.gameHost = null;
                            for (const client of this.clients) {
                                if (client.gameClient) client.close(1000, 'Game mode ended');
                            }
                        } else this.game?.action(data.action, this.gameType === 'marble' ? data.maxPlayers : data.lane);
                    }
                    return;
                }
                console.log('chatDisplay 메시지 수신:', data);
                switch (data.messageType) {
                    case 'request_broad_time':
                        // 방송 시간 정보 전송
                        this.soopScrapper?.sendBroadTime();
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
                if (this.gameHost === ws) {
                    this.gameHost = null;
                    this.game?.pause();
                }
                console.log('chatDisplay 클라이언트 연결 종료');
                this.clients = this.clients.filter(client => client !== ws);
                if (!this.clients.some(client => client.gameClient)) {
                    this.game?.destroy();
                    this.game = null;
                    this.gameHost = null;
                }

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

    

        await new Promise((resolve, reject) => {
            this.wss.once('error', reject);
            this.wss.once('listening', () => {
                this.wss.off('error', reject);
                resolve();
            });
        });
        console.log(`WebSocket 서버 대기 중: ws://localhost:${config.PORT.CHAT_DISPLAY}`);

    }
    // shutdown 스케줄링 메서드
    scheduleShutdown() {
        if (this.destroyed) return;
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

        this.game?.acceptChat(message);
        const historyUser = this.historyStore?.record(message);
        const messageWithId = {
            ...message,
            historyUser,
            messageId: this.generateMessageId(),
            timestamp: Date.now()
        };

        // 버퍼에 메시지 저장
        this.messageBuffer.set(messageWithId.messageId, messageWithId);
 
        // 오래된 메시지 정리
        this.cleanupOldMessages();

        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                if (client.gameClient) return;
                if (client.historyUser) {
                    if (historyUser && client.historyUser.platform === historyUser.platform && client.historyUser.userId === historyUser.userId) {
                        client.send(JSON.stringify({ messageType: 'history_changed' }));
                    }
                    return;
                }
                client.send(JSON.stringify(messageWithId));
                this.clientLastSeen.set(client, Date.now());
            }
        });
    }

    sendGameState(state) {
        for (const client of this.clients) {
            if (client.gameClient && client.gameType === this.gameType && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ messageType: this.gameType + '_state', state, canControl: client === this.gameHost }));
            }
        }
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
        this.destroyed = true;
        this.game?.destroy();
        this.cancelShutdownTimer();
        this.onShutdownCallback = null;
        
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
            for (const client of this.wss.clients) client.close(1000);
            this.wss.close();
        }
        
        console.log('ChatHub 자원 해제 완료');
    }

}
