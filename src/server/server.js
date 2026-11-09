import express from 'express';
import path from 'path';
import config from '../../config.js';
import { finishConfigUpdate, migrateMemoBackupInterval, writeConfigFile } from '../../installer.js';
import { fileURLToPath } from 'url';
import ChatHub from './chat/ChatHub.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import GistBackup from './gist/GistBackup.js';
import ChatHistoryStore from './history/ChatHistoryStore.js';
import { migrateHistoryLimit } from './history/migrateHistoryLimit.js';
import { createHistoryHandler, createNotesHandler } from './history/historyApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server = null;
let chatHub = null;

let gistBackup = null;


try {
    const root = path.resolve(__dirname, '../..');
    if (finishConfigUpdate(root)) {
        const { default: updated } = await import('../../config.js?release');
        for (const key of Object.keys(config)) delete config[key];
        Object.assign(config, updated);
    }
    if (migrateMemoBackupInterval(root, config)) {
        console.log('메모 백업 대기 시간을 5초로 변경했습니다.');
    }
} catch (error) {
    console.error('설정 준비 실패:', error.code || error.name);
}

const app = express();
app.use(express.json());
const historyStore = new ChatHistoryStore({
    limit: await migrateHistoryLimit(path.resolve(__dirname, '../..'), config.CHAT_HISTORY?.MAX_MESSAGES_PER_USER),
    excludedNicknames: config.CHAT_HISTORY?.EXCLUDED_NICKNAMES,
    channels: { chzzk: config.CHZZK.CHANNEL_ID, soop: config.SOOP.CHANNEL_ID, twitch: config.TWITCH.CHANNEL_ID }
});
await historyStore.ready;
app.get('/api/chat-history', createHistoryHandler(historyStore));
app.get('/api/chat-history/notes', createNotesHandler(historyStore));
app.post('/api/chat-history/notes', createNotesHandler(historyStore));



// 방송 시작 날짜 기준으로 오늘 날짜 반환


// 방송 날짜 기준 파일명 생성
function getBroadcastDateFileName() {
    const broadcastDate = chatHub?.getBroadcastDate()?.replace(/-/g, '');
    const now = new Date();
    const today = String(now.getFullYear()) + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
    const date = /^\d{8}$/.test(broadcastDate || '') ? broadcastDate : today;
    return `memo_${date}.txt`;
}

// 메모 저장 API 엔드포인트 수정
app.get('/api/memo-backup-status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(gistBackup
        ? { enabled: true, ...gistBackup.status }
        : { enabled: false, message: 'Gist 메모 백업 토큰을 확인한 뒤 YoBot을 재시작해 주세요.' });
});

app.post('/api/save-memo', async (req, res) => {
    try {
        const { content, timestamp } = req.body;

        if (!content) {
            return res.status(400).json({ error: '내용이 필요합니다.' });
        }

        // 방송 시작 날짜 기준으로 파일명 생성
        const fileName = getBroadcastDateFileName();

        // memo 디렉토리가 없으면 생성
        const memoDir = path.join(process.cwd(), 'memo');
        if (!fs.existsSync(memoDir)) {
            fs.mkdirSync(memoDir, { recursive: true });
        }

        const memoPath = path.join(memoDir, fileName);

        // 파일이 존재하면 내용을 추가, 없으면 새로 생성
        await fsPromises.appendFile(memoPath, content + ' (' + timestamp + ')\n', 'utf8');

        console.log(`메모 저장됨: ${fileName} - ${content}`);

        let backup = { enabled: false, message: 'Gist 메모 백업 토큰을 확인한 뒤 YoBot을 재시작해 주세요.' };
        if (gistBackup) {
            const delayMs = config.UPDATE.BACKUP_INTERVAL ?? 5000;
            gistBackup.backupMemo(delayMs);
            backup = { enabled: true, revision: gistBackup.status.revision, delayMs };
        }


        res.json({
            success: true,
            message: '메모가 저장되었습니다.',
            backup,
            fileName: fileName
        });


    } catch (error) {
        console.error('메모 저장 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});




function configSource(settings) {
    return '// config.js\nconst config = ' + JSON.stringify(settings, null, 4) + ';\nexport default config;\n';
}

app.get('/config.js', (_req, res) => {
    const browserConfig = { ...config, UPDATE: { ...config.UPDATE, GIST: { ...config.UPDATE.GIST, TOKEN: '' } } };
    res.set('Cache-Control', 'no-store').type('js').send(configSource(browserConfig));
});

app.post('/save-config', (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
        return res.status(403).json({ message: 'YoBot을 실행한 PC에서 설정을 저장해 주세요.' });
    }
    if (chatHub) return res.status(409).json({ message: '채팅을 종료한 뒤 설정을 변경해 주세요.' });

    const { serverPort, chatDisplayPort, maxMessages, chzzkChannelId, chzzkUrl, chzzkWsUrl,
        soopBjId, soopWsUrl, soopPlayerApi, twitchChannelId } = req.body;
    if (![serverPort, chatDisplayPort].every(port => Number.isInteger(port) && port >= 1000 && port <= 65535) ||
        chatDisplayPort === serverPort || chatDisplayPort === server.address()?.port ||
        !Number.isInteger(maxMessages) || maxMessages < 1 || maxMessages > 1000 ||
        ![chzzkChannelId, chzzkUrl, chzzkWsUrl, soopBjId, soopWsUrl, soopPlayerApi, twitchChannelId]
            .every(value => typeof value === 'string')) {
        return res.status(400).json({ message: '채널 설정과 서로 다른 유효한 포트 번호를 확인해 주세요.' });
    }

    const updated = {
        ...config,
        MAX_MESSAGES: maxMessages,
        PORT: { ...config.PORT, SERVER: serverPort, CHAT_DISPLAY: chatDisplayPort },
        CHZZK: { ...config.CHZZK, CHANNEL_ID: chzzkChannelId.trim(), URL: chzzkUrl.trim(), WS_URL: chzzkWsUrl.trim() },
        SOOP: { ...config.SOOP, CHANNEL_ID: soopBjId.trim(), WS_URL: soopWsUrl.trim(), PLAYER_API_URL: soopPlayerApi.trim() },
        TWITCH: { ...config.TWITCH, CHANNEL_ID: twitchChannelId.trim() }
    };

    try {
        writeConfigFile(path.resolve(__dirname, '../../config.js'), configSource(updated));
        Object.assign(config, updated);
        res.json({ success: true });
    } catch (error) {
        console.error('설정 저장 중 오류:', error.code || error.name);
        res.status(500).json({ message: '이 YoBot 폴더에 설정을 저장할 수 없습니다.' });
    }
});

// 채팅 시작 엔드포인트
app.post('/start-chat', async (req, res) => {
    try {
        if (chatHub) {
            return res.status(400).json({
                success: false,
                message: '채팅이 이미 실행 중입니다.'
            });
        }


        historyStore.channels = { chzzk: config.CHZZK.CHANNEL_ID, soop: config.SOOP.CHANNEL_ID, twitch: config.TWITCH.CHANNEL_ID };

        //const ChatHub = (await import('./chat/ChatHub.js')).default;
        chatHub = new ChatHub(historyStore);

        if (config.UPDATE.GIST.TOKEN) {
            gistBackup = new GistBackup();
        }

        // shutdown 콜백 설정
        chatHub.setShutdownCallback(() => {
            shutdown();
        });

        await chatHub.init();
        if (gistBackup) await gistBackup.init();

        // gist 메모 백업 기능
        // 서버 시작 시 백업 초기화


        res.json({
            success: true,
            message: '채팅 연결이 시작되었습니다.'
        });

    } catch (error) {
        console.error('채팅 시작 중 오류:', error);
        chatHub?.destroy();
        chatHub = null;
        gistBackup = null;
        res.status(500).json({
            success: false,
            message: '채팅 시작에 실패했습니다: ' + error.message
        });
    }
});


// 명령어 관리 엔드포인트
app.post('/api/command', async (req, res) => {
    try {
        const { action, command, response } = req.body;
        
        if (!gistBackup) {
            return res.status(400).json({ 
                success: false, 
                message: 'GistBackup이 초기화되지 않았습니다.' 
            });
        }
        
        if (action === 'register') {
            // 명령어 등록
            gistBackup.addCommand(command, response);
            const saved = await gistBackup.saveCommandsToGist();
            
            if (saved) {
                res.json({
                    success: true,
                    message: `명령어 ${command}가 등록되었습니다.`
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Gist 저장에 실패했습니다.'
                });
            }
            
        } else if (action === 'remove') {
            // 명령어 삭제
            console.log(`명령어 제거 요청: ${command}`);
            gistBackup.removeCommand(command);
            console.log(`제거 후 Map 크기: ${gistBackup.commands.size}`);
            const saved = await gistBackup.saveCommandsToGist();
            console.log(`Gist 저장 결과: ${saved}`);
            if (saved) {
                res.json({
                    success: true,
                    message: `명령어 ${command}가 삭제되었습니다.`
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Gist 저장에 실패했습니다.'
                });
            }
            
        } else if (action === 'execute') {
            // 명령어 실행
            const cmdResponse = gistBackup.getCommand(command);
            if (cmdResponse) {
                res.json({
                    success: true,
                    response: cmdResponse
                });
            } else {
                res.json({
                    success: false,
                    message: '등록되지 않은 명령어입니다.'
                });
            }
            
        } else if (action === 'list') {
            // 명령어 목록 조회
            const commands = gistBackup.getAllCommands();
            res.json({
                success: true,
                commands: commands
            });
            
        } else {
            res.status(400).json({
                success: false,
                message: '지원하지 않는 액션입니다.'
            });
        }
        
    } catch (error) {
        console.error('명령어 처리 오류:', error);
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});


// 로그 디렉토리 생성
const logDir = path.join(__dirname, 'log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 로깅 함수 추가
function logServerError(error, context = '') {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const timestamp = new Date().toISOString();
    const logFile = path.join(logDir, `log_server_${date}.log`);

    const logEntry = `[${timestamp}] ${context ? `[${context}] ` : ''}${error.stack || error}\n`;

    fs.appendFile(logFile, logEntry, (err) => {
        if (err) console.error('로그 파일 쓰기 실패:', err);
    });
}


const clientDirectory = path.join(__dirname, '../client');
app.use('/src/client', express.static(clientDirectory));
app.use(express.static(clientDirectory));
for (const file of ['run.html', 'run.css', 'package.json']) {
    app.get('/' + file, (_req, res) => res.sendFile(path.resolve(__dirname, '../..', file)));
}

server = app.listen(config.PORT.SERVER, async () => {
    console.log(`Server running at http://localhost:${config.PORT.SERVER}/`);

    //서버가 최초 실행된 상태에서 사용자가 run.html 의 시작 버튼 동작을 통해 ChatHub를 생성하고 연결을 시도한다.

}).on('error', async error => {
    console.error('Server error:', error);
    logServerError(error, 'Server');
    process.exitCode = 1;
    await historyStore.close();
});

// 전역 오류 처리
process.on('uncaughtException', (error) => {
    logServerError(error, 'Uncaught Exception');
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    const error = new Error(`Unhandled Rejection: ${reason}`);
    logServerError(error, 'Unhandled Rejection');
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});




// shutdown 함수 추가
let shuttingDown = false;
async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('서버 종료 시작...');

    if (gistBackup) {
        console.log('Gist 종료중...');
        await gistBackup.destroy();
    }

    // ChatHub 자원 해제
    if (chatHub) {
        chatHub.destroy();
    }

    try { await historyStore.close(); }
    catch (error) { console.error('채팅 기록 종료 저장 실패:', error.message); }

    // Express 서버 종료
    if (server) {
        server.close(() => {
            console.log('Express 서버가 정상적으로 종료되었습니다.');
            process.exit();
        });
    } else {
        process.exit();
    }

}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

// 서버 종료 엔드포인트
app.post('/shutdown', async (req, res) => {
    console.log('서버 종료 요청 받음');
    try {
        res.json({
            success: true,
            message: '서버 종료 신호를 받았습니다.'
        });

        // 응답을 보낸 후 종료
        setTimeout(() => {
            shutdown();
        }, 100);

    } catch (error) {
        console.error('종료 요청 처리 중 오류:', error);
        res.status(500).json({
            success: false,
            message: '종료 요청 처리에 실패했습니다.'
        });
    }
});


