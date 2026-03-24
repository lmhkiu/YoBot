import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';

class AutoUpdater {
    constructor() {
        this.config = null;
        this.loadConfig();
    }

    async loadConfig() {
        try {
            const module = await import('./config.js');
            this.config = module.default;
        } catch (error) {
            console.error('Failed to load config:', error.message);
        }
    }

    async checkForUpdates() {
        if (!this.config?.UPDATE?.AUTO_UPDATE) {
            console.log('Auto update is disabled');
            return { hasUpdate: false, message: 'Auto update is disabled' };
        }

        try {
            const { GITHUB_OWNER, GITHUB_REPO } = this.config.UPDATE;
            const response = await axios.get(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
            const latestRelease = response.data;

            const currentVersion = this.getVersionFromPackage();
            const latestVersion = latestRelease.tag_name.replace('v', '');

            console.log(`Current version: ${currentVersion}`);
            console.log(`Latest version: ${latestVersion}`);

            if (this.compareVersions(latestVersion, currentVersion) > 0) {
                return {
                    hasUpdate: true,
                    currentVersion,
                    latestVersion,
                    downloadUrl: latestRelease.zipball_url,
                    releaseNotes: latestRelease.body
                };
            }

            return { hasUpdate: false, message: 'Already up to date' };
        } catch (error) {
            console.error('Failed to check for updates:', error.message);
            return { hasUpdate: false, error: error.message };
        }
    }

    getVersionFromPackage() {
        try {
            const packagePath = path.join(process.cwd(), 'package.json');
            const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
            return packageData.version;
        } catch (error) {
            console.error('Failed to read package.json:', error.message);
            return '0.0.0';
        }
    }

    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;
            
            if (part1 > part2) return 1;
            if (part1 < part2) return -1;
        }
        
        return 0;
    }

    async createBackup() {
        if (!this.config?.UPDATE?.BACKUP_ENABLED) {
            console.log('Backup is disabled');
            return false;
        }

        try {
            const backupDir = path.join(process.cwd(), 'backup');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `backup-${timestamp}`);
            
            // Windows용 백업 명령어
            if (process.platform === 'win32') {
                execSync(`xcopy "${process.cwd()}" "${backupPath}" /E /I /H /Y`, { stdio: 'inherit' });
            } else {
                execSync(`cp -r "${process.cwd()}" "${backupPath}"`, { stdio: 'inherit' });
            }
            
            console.log(`Backup created at: ${backupPath}`);
            return true;
        } catch (error) {
            console.error('Failed to create backup:', error.message);
            return false;
        }
    }

    async downloadUpdate(downloadUrl) {
        try {
            console.log('Downloading update from:', downloadUrl);
            const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
            
            const downloadPath = path.join(process.cwd(), 'update.zip');
            fs.writeFileSync(downloadPath, response.data);
            
            console.log(`Update downloaded to: ${downloadPath}`);
            return downloadPath;
        } catch (error) {
            console.error('Failed to download update:', error.message);
            throw error;
        }
    }

    async extractUpdate(zipPath) {
        try {
            // 압축 해제를 위한 임시 디렉토리 생성
            const tempDir = path.join(process.cwd(), 'temp_update');
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            fs.mkdirSync(tempDir, { recursive: true });

            // Windows에서 압축 해제
            if (process.platform === 'win32') {
                execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`, { stdio: 'inherit' });
            } else {
                // Linux/macOS에서는 unzip 명령어 사용
                execSync(`unzip -o '${zipPath}' -d '${tempDir}'`, { stdio: 'inherit' });
            }

            // GitHub zipball은 내부에 {owner}-{repo}-{commit} 디렉토리가 있음
            const extractedDirs = fs.readdirSync(tempDir).filter(item => {
                const itemPath = path.join(tempDir, item);
                return fs.statSync(itemPath).isDirectory();
            });

            if (extractedDirs.length === 0) {
                throw new Error('No extracted directory found');
            }

            const sourceDir = path.join(tempDir, extractedDirs[0]);
            return { sourceDir, tempDir };
        } catch (error) {
            console.error('Failed to extract update:', error.message);
            throw error;
        }
    }

    async applyUpdate(sourceDir) {
        try {
            console.log('Applying update...');
            
            // 현재 디렉토리의 파일들을 업데이트
            const updateFiles = fs.readdirSync(sourceDir);
            
            for (const file of updateFiles) {
                const sourcePath = path.join(sourceDir, file);
                const targetPath = path.join(process.cwd(), file);
                
                // node_modules, backup, temp 디렉토리는 건너뛰기
                if (['node_modules', 'backup', 'temp', 'temp_update'].includes(file)) {
                    continue;
                }
                
                // 파일/디렉토리 복사
                if (process.platform === 'win32') {
                    execSync(`xcopy "${sourcePath}" "${targetPath}" /E /I /H /Y`, { stdio: 'inherit' });
                } else {
                    execSync(`cp -r "${sourcePath}" "${targetPath}"`, { stdio: 'inherit' });
                }
            }
            
            console.log('Update applied successfully!');
            return true;
        } catch (error) {
            console.error('Failed to apply update:', error.message);
            throw error;
        }
    }

    async cleanup(zipPath, tempDir) {
        try {
            // 다운로드된 zip 파일 삭제
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }
            
            // 임시 디렉토리 삭제
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            
            console.log('Cleanup completed');
        } catch (error) {
            console.error('Cleanup failed:', error.message);
        }
    }

    async performUpdate() {
        const updateInfo = await this.checkForUpdates();
        
        if (!updateInfo.hasUpdate) {
            console.log(updateInfo.message || 'No updates available');
            return false;
        }

        console.log('Update available! Creating backup...');
        await this.createBackup();

        console.log('Downloading update...');
        const zipPath = await this.downloadUpdate(updateInfo.downloadUrl);

        try {
            console.log('Extracting update...');
            const { sourceDir, tempDir } = await this.extractUpdate(zipPath);

            console.log('Applying update...');
            await this.applyUpdate(sourceDir);

            console.log('Release notes:', updateInfo.releaseNotes);
            console.log('Update completed successfully! Please restart the application.');
            
            return true;
        } catch (error) {
            console.error('Update failed:', error.message);
            return false;
        } finally {
            await this.cleanup(zipPath, path.join(process.cwd(), 'temp_update'));
        }
    }
}

// 기본 실행 로직
if (import.meta.url === `file://${process.argv[1]}`) {
    const updater = new AutoUpdater();
    updater.performUpdate().catch(console.error);
}

export default AutoUpdater;