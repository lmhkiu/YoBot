// src/server/gist/GistBackup.js
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';


export default class GistBackup {
    constructor(config) {
        this.config = config;
        this.token = "ghp_"+config.UPDATE.GIST.TOKEN;
        console.log('GistBackup token:', this.token);
        this.backupDir = path.join(process.cwd(), 'memo');
        this.backupFile = path.join(process.cwd(), 'gist_backups.json');
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
    async backupOnShutdown(broadcastDate) {
        try {
            // 1. 현재 Gist 개수 확인
            const backups = await this.loadBackupInfo();
            console.log(`현재 Gist 개수: ${backups.length}`);

            // 2. 100개 이상이면 가장 오래된 것 삭제
            if (backups.length >= 100) {
                const oldest = backups.slice(0, backups.length - 99); // 99개로 맞추기
                console.log(`${oldest.length}개의 오래된 Gist 삭제 시작...`);
                
                for (const backup of oldest) {
                    await this.deleteGist(backup.gistId);
                    await this.removeBackupInfo(backup.gistId);
                }
            }

            // 3. 방송 시작 날짜 기준으로 메모 파일 백업
            // server.js의 getBroadcastDate() 함수를 사용하기 위해 동적으로 파일명 생성
            const fileName = `memo_${broadcastDate.toISOString().split('T')[0].replace(/-/g, '')}.txt`;
            
            try {
                const filePath = path.join(this.backupDir, fileName);
                const content = await fs.readFile(filePath, 'utf8');
                
                const result = await this.uploadMemoFile(fileName, content);
                if (result.success) {
                    console.log(`종료 시 백업 완료: ${result.url}`);
                }
                return result;
            } catch (error) {
                console.log(`메모 파일 없음: ${fileName}`);
                return { success: false, message: '백업할 메모 파일 없음' };
            }

        } catch (error) {
            console.error('종료 시 백업 실패:', error);
            return { success: false, error: error.message };
        }
    }
}