import express from 'express';
import path from 'path';
import config from '../../config.js';
import { fileURLToPath } from 'url';
import ChatHub from './chat/ChatHub.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import GistBackup from './gist/GistBackup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let server = null;
let chatHub = null;

let gistBackup = null;


const app = express();
app.use(express.json());



// 방송 시작 날짜 기준으로 오늘 날짜 반환


// 방송 날짜 기준 파일명 생성
function getBroadcastDateFileName() {
    const date = chatHub.getBroadcastDate();
    return `memo_${date.replace(/-/g, '')}.txt`;
}

// 메모 저장 API 엔드포인트 수정
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

        // Gist에 백업
        if (gistBackup) {
            await gistBackup.backupMemo(config.UPDATE.BACKUP_INTERVAL);
        }


        res.json({
            success: true,
            message: '메모가 저장되었습니다.',
            fileName: fileName
        });


    } catch (error) {
        console.error('메모 저장 오류:', error);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});




// 설정 저장 엔드포인트
app.post('/save-config', async (req, res) => {
    try {
        const { config } = req.body;

        if (!config) {
            return res.status(400).json({
                success: false,
                message: '설정 데이터가 없습니다.'
            });
        }

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        await fsPromises.writeFile(path.join(__dirname, '../../config.js'), config, 'utf8');

        res.json({
            success: true,
            message: '설정이 성공적으로 저장되었습니다.'
        });

    } catch (error) {
        console.error('설정 저장 중 오류:', error);
        res.status(500).json({
            success: false,
            message: '설정 저장에 실패했습니다: ' + error.message
        });
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


        await loadChannelIDs();

        //const ChatHub = (await import('./chat/ChatHub.js')).default;
        chatHub = new ChatHub();

        if (config.UPDATE.GIST.TOKEN) {
            gistBackup = new GistBackup();
        }

        // shutdown 콜백 설정
        chatHub.setShutdownCallback(() => {
            shutdown();
        });

        await chatHub.init();
        await gistBackup.init(chatHub.getBroadcastDate());

        // gist 메모 백업 기능
        // 서버 시작 시 백업 초기화


        res.json({
            success: true,
            message: '채팅 연결이 시작되었습니다.'
        });

    } catch (error) {
        console.error('채팅 시작 중 오류:', error);
        chatHub = null;
        res.status(500).json({
            success: false,
            message: '채팅 시작에 실패했습니다: ' + error.message
        });
    }
});



// CHANNEL_ID만 읽어 업데이트하는 함수
async function loadChannelIDs() {
    try {
        const configPath = path.join(__dirname, '../../config.js');
        const configText = await fsPromises.readFile(configPath, 'utf8');

        // 정규식으로 CHANNEL_ID 추출 (CHZZK, SOOP, TWITCH)
        const chzzkMatch = configText.match(/"CHZZK":\s*\{[^}]*"CHANNEL_ID":\s*"([^"]+)"/);
        const soopMatch = configText.match(/"SOOP":\s*\{[^}]*"CHANNEL_ID":\s*"([^"]+)"/);
        const twitchMatch = configText.match(/"TWITCH":\s*\{[^}]*"CHANNEL_ID":\s*"([^"]+)"/);

        if (chzzkMatch) config.CHZZK.CHANNEL_ID = chzzkMatch[1];
        if (soopMatch) config.SOOP.CHANNEL_ID = soopMatch[1];
        if (twitchMatch) config.TWITCH.CHANNEL_ID = twitchMatch[1];

        console.log('CHANNEL_ID 값들 업데이트됨');
    } catch (error) {
        console.error('CHANNEL_ID 로드 실패:', error);
    }
}

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


// 정적 파일 서빙
app.use(express.static(path.join(__dirname, '../client'))); //client 경로에 접근 권한 부여
app.use(express.static(path.join(__dirname, '../../'))); //root 경로에 접근 권한 부여, server.js의 입장에서 상대적 경로이다.
// 루트 경로 처리
app.get('/', (_req, res) => {   //브라우저에 localhost:13101/ 를 입력해도 index.html가 서빙 되도록 하는 역할.
    res.sendFile(path.join(__dirname, '../client/index.html')); //client 경로의 index.html 파일 제공
});



// 기타 경로 처리 (필요시)
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, _req.path));
});

server = app.listen(config.PORT.SERVER, async () => {
    console.log(`Server running at http://localhost:${config.PORT.SERVER}/`);

    //서버가 최초 실행된 상태에서 사용자가 run.html 의 시작 버튼 동작을 통해 ChatHub를 생성하고 연결을 시도한다.

}).on('error', (error) => {
    console.error('Server error:', error);
    logServerError(error, 'Server');
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
async function shutdown() {
    console.log('서버 종료 시작...');

    if (gistBackup) {
        console.log('Gist 종료중...');
        await gistBackup.destroy();
    }

    // ChatHub 자원 해제
    if (chatHub) {
        chatHub.destroy();
    }

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


