// src/server/gist/GistBackup.js
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import config from '../../../config.js';

export default class GistBackup {
    constructor() {

        this.token = "ghp_" + config.UPDATE.GIST.TOKEN;
        console.log('GistBackup token:', this.token);
        this.backupDir = path.join(process.cwd(), 'memo');
        this.backupFile = path.join(process.cwd(), 'gist_backups.json');
        this.broadcastStartDate = null;
        this.backupTimer = null; // 타이머 변수 추가
        this.commands = new Map(); // 명령어 목록 저장용
    }

    async init(broadcastStartDate) {
        this.broadcastStartDate = broadcastStartDate;
        console.log('GistBackup init - broadcastStartDate:', this.broadcastStartDate);

        // 서버와 동기화 (선택적)
        if (config.UPDATE.GIST.SYNC_WITH_SERVER) {
            try {
                await this.syncWithServer();
                console.log('GistBackup 서버 동기화 완료');
            } catch (error) {
                console.warn('서버 동기화 실패, 로컬 데이터로 진행:', error.message);
                // 동기화 실패해도 계속 진행
            }
        }

        //gist에서 명령어 목록을 가져온다.
        await this.getCommandList();

    }

    async syncWithServer() {
        try {
            // GitHub API로 전체 Gist 목록 조회
            const response = await axios.get('https://api.github.com/gists', {
                headers: { 'Authorization': `token ${this.token}` }
            });

            const serverGists = response.data;
            const localBackups = await this.loadBackupInfo();

            // 1. 서버에 있고 로컬에 없는 Gist 추가
            const serverOnly = serverGists.filter(server => 
                !localBackups.some(local => local.gistId === server.id)
            );

            // 2. 로컬에 있고 서버에 없는 기록 제거  
            const validBackups = localBackups.filter(local =>
                serverGists.some(server => server.id === local.gistId)
            );

            // 3. 서버 전용 Gist 정보를 로컬에 추가
            for (const gist of serverOnly) {
                const fileName = Object.keys(gist.files)[0];
                if (fileName && fileName.startsWith('memo_')) {
                    validBackups.push({
                        fileName,
                        gistId: gist.id,
                        url: gist.html_url,
                        createdAt: gist.created_at,
                        localBackup: true
                    });
                }
            }

            await fs.writeFile(this.backupFile, JSON.stringify(validBackups, null, 2));
            console.log(`동기화 완료: ${localBackups.length} -> ${validBackups.length}`);

        } catch (error) {
            console.error('서버 동기화 실패:', error.message);
        }
    }


    async getCommandList() {
        try {
            const gistId = config.BROADCAST_COMMANDS.gistId;
            const fileName = config.BROADCAST_COMMANDS.COMMANDS_FILE;
            console.log('Gist에서 명령어 목록을 가져오기:', gistId, fileName);
            // Gist에서 명령어 파일 가져오기
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                headers: { 'Authorization': `token ${this.token}` }
            });
            
            if (!response.ok) {
                console.log('Gist에서 명령어 목록을 가져오지 못했습니다.', response.status, response.statusText);
                this.commands = new Map();
                return;
            }
            
            const gistData = await response.json();
            const fileContent = gistData.files[fileName]?.content;
            
            if (fileContent) {
                // 명령어 파싱하여 Map에 저장 (공백으로 구분)
                this.commands = new Map();
                const lines = fileContent.split('\n');
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    // 첫 번째 공백을 기준으로 명령어와 응답 분리
                    const firstSpaceIndex = line.indexOf(' ');
                    if (firstSpaceIndex === -1) continue;
                    
                    const command = line.substring(0, firstSpaceIndex).trim();
                    const response = line.substring(firstSpaceIndex + 1).trim();
                    
                    if (command && response) {
                        this.commands.set(command, response);
                    }
                }
                
                console.log(`명령어 ${this.commands.size}개를 Gist에서 불러왔습니다.`);
            } else {
                this.commands = new Map();
            }
            
        } catch (error) {
            console.error('명령어 목록 로드 오류:', error);
            this.commands = new Map();
        }
    }

    async saveCommandsToGist() {
        try {
            const fileName = config.BROADCAST_COMMANDS.COMMANDS_FILE;
            const gistId = config.BROADCAST_COMMANDS.gistId;
            
            // 명령어 Map을 파일 형식으로 변환 (공백으로 구분)
            let content = '';
            for (const [command, response] of this.commands) {
                content += `${command} ${response}\n`;
            }
            
            // Gist 업데이트
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${this.token}` },
                body: JSON.stringify({
                    files: {
                        [fileName]: {
                            content: content
                        }
                    }
                })
            });
            
            if (response.ok) {
                console.log('명령어를 Gist에 저장했습니다.');
                return true;
            } else {
                console.error('Gist 명령어 저장 실패:', response.statusText);
                return false;
            }
            
        } catch (error) {
            console.error('명령어 Gist 저장 오류:', error);
            return false;
        }
    }

    // 명령어 관리 메서드들
    addCommand(command, response) {
        this.commands.set(command, response);
    }
    
    getCommand(command) {
        return this.commands.get(command);
    }
    
    getAllCommands() {
        return Array.from(this.commands.entries());
    }
    
    removeCommand(command) {
        return this.commands.delete(command);
    }


    // 메모 파일 업로드
    async uploadMemoFile(fileName, content) {
        try {
            const gistData = {
                description: `Memo backup - ${fileName} - ${new Date().toISOString()}`,
                public: false,
                files: {
                    [fileName]: { content: content }
                }
            };

            const response = await axios.post('https://api.github.com/gists', gistData, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const gist = response.data;

            // 백업 정보 저장
            await this.saveBackupInfo(fileName, gist.id, gist.html_url, gist.created_at);

            return {
                success: true,
                gistId: gist.id,
                url: gist.html_url,
                rawUrl: gist.files[fileName].raw_url
            };

        } catch (error) {
            console.error('Gist 업로드 실패:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    // 백업 정보 저장
    async saveBackupInfo(fileName, gistId, url, createdAt) {
        let backups = await this.loadBackupInfo();

        backups.push({
            fileName,
            gistId,
            url,
            createdAt,
            localBackup: true
        });

        await fs.writeFile(this.backupFile, JSON.stringify(backups, null, 2));
    }

    // 백업 정보 로드
    async loadBackupInfo() {
        try {
            const data = await fs.readFile(this.backupFile, 'utf8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    // Gist 삭제
    async deleteGist(gistId) {
        try {
            await axios.delete(`https://api.github.com/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            console.log(`Gist 삭제 완료: ${gistId}`);
        } catch (error) {
            console.error(`Gist 삭제 실패 ${gistId}:`, error.message);
        }
    }

    // 백업 정보 삭제
    async removeBackupInfo(gistId) {
        let backups = await this.loadBackupInfo();
        backups = backups.filter(b => b.gistId !== gistId);
        await fs.writeFile(this.backupFile, JSON.stringify(backups, null, 2));
    }

    // 서버 종료 시 백업
    async backupMemo(backupInterval = null) {
        try {
            // backupInterval이 있으면 타이머 설정
            if (backupInterval) {
                // 기존 타이머 취소
                if (this.backupTimer) {
                    clearTimeout(this.backupTimer);
                }

                // 새로운 타이머 설정
                this.backupTimer = setTimeout(async () => {
                    console.log(`${backupInterval}ms 경과 - 자동 백업 실행`);
                    await this.performBackup();
                    this.backupTimer = null;
                }, backupInterval);

                console.log(`${backupInterval}ms 후 자동 백업 예약됨`);
                return { success: true, message: '백업 예약됨' };
            } else {
                // 즉시 백업 실행
                return await this.performBackup();
            }
        } catch (error) {
            console.error('백업 예약 실패:', error);
            return { success: false, error: error.message };
        }
    }

    // 실제 백업 실행 함수
    async performBackup() {
        try {
            // 1. 현재 Gist 개수 확인
            const backups = await this.loadBackupInfo();
            console.log(`현재 Gist 개수: ${backups.length}`);

            // 2. 100개 이상이면 가장 오래된 것 삭제
            if (backups.length >= 100) {
                const oldest = backups.slice(0, backups.length - 99);
                console.log(`${oldest.length}개의 오래된 Gist 삭제 시작...`);

                for (const backup of oldest) {

                    if (backup.gistId === config.BROADCAST_COMMANDS.gistId) {
                        console.log(`방송 명령어 Gist(${backup.gistId})는 삭제하지 않고 건너뜁니다.`);
                        continue;
                    }
                    await this.deleteGist(backup.gistId);
                    await this.removeBackupInfo(backup.gistId);
                }
            }

            // 3. 방송 시작 날짜 기준으로 메모 파일 백업
            const fileName = `memo_${this.broadcastStartDate}.txt`;

            try {
                const filePath = path.join(this.backupDir, fileName);
                const content = await fs.readFile(filePath, 'utf8');

                // 기존에 같은 이름의 파일이 있는지 확인
                const existingBackup = backups.find(b => b.fileName === fileName);

                let result;
                if (existingBackup) {
                    // 기존 Gist 업데이트
                    result = await this.updateExistingGist(existingBackup.gistId, fileName, content);
                    console.log(`기존 Gist 업데이트 완료: ${result.url}`);
                } else {
                    // 새 Gist 생성
                    result = await this.uploadMemoFile(fileName, content);
                    console.log(`새 Gist 생성 완료: ${result.url}`);
                }

                return result;
            } catch (error) {
                console.log(`메모 파일 없음: ${fileName}`);
                return { success: false, message: '백업할 메모 파일 없음' };
            }

        } catch (error) {
            console.error('백업 실패:', error);
            return { success: false, error: error.message };
        }
    }

    // 기존 Gist 업데이트
    async updateExistingGist(gistId, fileName, content) {
        try {
            const gistData = {
                description: `Memo backup - ${fileName} - ${new Date().toISOString()}`,
                files: {
                    [fileName]: { content: content }
                }
            };

            const response = await axios.patch(`https://api.github.com/gists/${gistId}`, gistData, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            const gist = response.data;

            // 백업 정보 업데이트
            await this.updateBackupInfo(fileName, gistId, gist.html_url, gist.updated_at);

            return {
                success: true,
                gistId: gist.id,
                url: gist.html_url,
                rawUrl: gist.files[fileName].raw_url
            };

        } catch (error) {
            console.error('Gist 업데이트 실패:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    // 백업 정보 업데이트
    async updateBackupInfo(fileName, gistId, url, updatedAt) {
        let backups = await this.loadBackupInfo();

        const existingIndex = backups.findIndex(b => b.gistId === gistId);
        if (existingIndex !== -1) {
            backups[existingIndex] = {
                fileName,
                gistId,
                url,
                createdAt: backups[existingIndex].createdAt,
                updatedAt,
                localBackup: true
            };
        }

        await fs.writeFile(this.backupFile, JSON.stringify(backups, null, 2));
    }

    async destroy() {

        // 기존 타이머 취소
        if (this.backupTimer) {
            clearTimeout(this.backupTimer);
            this.backupTimer = null;
        }

        await this.performBackup();
    }
}