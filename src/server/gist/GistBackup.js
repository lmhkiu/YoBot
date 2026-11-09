// src/server/gist/GistBackup.js
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { createHash } from 'node:crypto';
import config from '../../../config.js';

const memoName = /^memo_\d{8}\.txt$/;
const memoEnd = / \(\d{8} \d{2}:\d{2}:\d{2}\)(?=\n|$)/;

function memoEntries(content) {
    const text = content.replace(/\r\n/g, '\n').replace(/\n+$/, '');
    if (!text) return [];
    if (!memoEnd.test(text)) return text.split('\n');
    return text.split(/(?<= \(\d{8} \d{2}:\d{2}:\d{2}\))\n/);
}

function mergeMemos(remote, local) {
    const counts = new Map();
    for (const memo of memoEntries(remote)) counts.set(memo, (counts.get(memo) || 0) + 1);
    const missing = [];
    for (const memo of memoEntries(local)) {
        const available = counts.get(memo) || 0;
        if (available) counts.set(memo, available - 1);
        else missing.push(memo);
    }
    if (!missing.length) return remote;
    const separator = remote && !remote.endsWith('\n') ? '\n' : '';
    return remote + separator + missing.join('\n') + '\n';
}

export default class GistBackup {
    constructor({ token = config.UPDATE.GIST.TOKEN } = {}) {

        const storedToken = String(token || '').trim();
        this.token = /^(ghp_|github_pat_)/.test(storedToken) ? storedToken : 'ghp_' + storedToken;
        this.backupDir = path.join(process.cwd(), 'memo');
        this.memoApi = axios.create({
            baseURL: 'https://api.github.com',
            timeout: 15000,
            headers: { Authorization: 'token ' + this.token, Accept: 'application/vnd.github+json' }
        });
        this.backupTask = Promise.resolve();
        this.status = { revision: 0, completedRevision: 0, error: null };
        this.closing = false;
        this.syncedMemos = new Map();
        this.backupTimer = null; // 타이머 변수 추가
        this.commands = new Map(); // 명령어 목록 저장용
    }

    async init() {
        // Each installation can recover the memos still on its own disk.
        this.backupMemo();
        await this.getCommandList();
    }

    async listMemoGists() {
        const byFile = new Map();
        let next = new URL('https://api.github.com/gists?per_page=100');
        while (next) {
            if (next.origin !== 'https://api.github.com' || next.pathname !== '/gists') {
                throw new Error('Unexpected Gist pagination URL');
            }
            const { data, headers } = await this.memoApi.get(next.href);
            for (const gist of data) {
                if (gist.public !== false || gist.id === config.BROADCAST_COMMANDS.gistId) continue;
                for (const name of Object.keys(gist.files)) {
                    if (memoName.test(name) && !byFile.has(name)) byFile.set(name, gist);
                }
            }
            const link = headers.link?.match(/<([^>]+)>;\s*rel="next"/);
            next = link ? new URL(link[1]) : null;
        }
        return byFile;
    }

    async getCommandList() {
        try {
            const gistId = config.BROADCAST_COMMANDS.gistId;
            const fileName = config.BROADCAST_COMMANDS.COMMANDS_FILE;
            if (!gistId || !fileName) return;
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


    backupMemo(interval = 0) {
        const revision = ++this.status.revision;
        if (this.backupTimer) {
            clearTimeout(this.backupTimer);
            this.backupTimer = null;
        }
        if (interval) {
            console.log('Gist 메모 백업 예약:', interval + 'ms');
            this.backupTimer = setTimeout(() => {
                this.backupTimer = null;
                this.backupMemo();
            }, interval);
            return { revision, delayMs: interval };
        }
        this.backupTask = this.backupTask.then(async () => {
            try {
                await this.performBackup();
                this.status.completedRevision = revision;
                this.status.error = null;
            } catch (error) {
                const code = error.response?.status || error.code || error.name;
                const message = [401, 403].includes(code)
                    ? 'Gist 인증 또는 권한을 확인해 주세요. HTTP ' + code
                    : 'Gist 업로드에 실패했습니다. 재시도 대기 중 (' + code + ')';
                this.status.error = { revision, message };
                console.error(message);
                if (!this.closing && !this.backupTimer) {
                    this.backupTimer = setTimeout(() => {
                        this.backupTimer = null;
                        this.backupMemo();
                    }, 15000);
                }
            }
        });
        return this.backupTask;
    }

    async performBackup() {
        let filenames;
        try {
            filenames = await fs.readdir(this.backupDir, { withFileTypes: true });
        } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
        }
        const pending = [];
        for (const file of filenames) {
            if (!file.isFile() || !memoName.test(file.name)) continue;
            const content = await fs.readFile(path.join(this.backupDir, file.name), 'utf8');
            const hash = createHash('sha256').update(content).digest('hex');
            if (content.trim() && this.syncedMemos.get(file.name) !== hash) {
                pending.push({ name: file.name, content, hash });
            }
        }
        if (!pending.length) return;

        const remote = await this.listMemoGists();
        let failure;
        for (const { name, content, hash } of pending) {
            try {
                await this.syncMemo(name, content, remote.get(name));
                this.syncedMemos.set(name, hash);
            } catch (error) {
                console.error('Gist 메모 백업 실패:', name, error.response?.status || error.code || error.name);
                failure = error;
            }
        }
        if (failure) throw failure;
    }

    async syncMemo(name, local, existing) {
        if (existing) {
            const { data } = await this.memoApi.get('/gists/' + encodeURIComponent(existing.id));
            const file = data.files[name];
            if (data.public !== false || !file || file.truncated || typeof file.content !== 'string') {
                throw new Error('기존 Gist 메모 원문을 읽을 수 없습니다.');
            }
            const content = mergeMemos(file.content, local);
            if (content === file.content) return;
            await this.memoApi.patch('/gists/' + encodeURIComponent(existing.id), { files: { [name]: { content } } });
        } else {
            await this.memoApi.post('/gists', {
                description: 'Memo backup - ' + name,
                public: false,
                files: { [name]: { content: local } }
            });
        }
        console.log('Gist 메모 백업 완료:', name);
    }

    async destroy() {
        this.closing = true;
        await this.backupMemo();
    }
}
