import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
// 수정 후
import config from './config.js';

class AutoUpdater {
    constructor() {
        this.config = null;

    }

    async loadConfig() {
        try {
            // 수정 후
            this.config = config;
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

            // Windows에서 압축 해제 (PowerShell 사용)
            if (process.platform === 'win32') {
                try {
                    execSync(`tar -xf "${zipPath}" -C "${tempDir}"`, {
                        stdio: 'inherit',
                        encoding: 'utf8'
                    });
                } catch (error) {
                    // 최후의 수단으로 PowerShell
                    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tempDir}' -Force"`);
                }
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
            console.log(`Extracted to: ${sourceDir}`);
            return { sourceDir, tempDir };
        } catch (error) {
            console.error('Failed to extract update:', error.message);
            throw error;
        }
    }

    async applyUpdate(sourceDir) {
        try {
            console.log('Applying update...');

            const updateFiles = fs.readdirSync(sourceDir);
            console.log(`Files to update: ${updateFiles.length}`);

            for (const file of updateFiles) {
                const sourcePath = path.join(sourceDir, file);
                const targetPath = path.join(process.cwd(), file);

                // update-run.js는 건너뛰기 (실행 중인 임시 파일)
                if (file === 'update-run.js') {
                    console.log(`Skipping ${file} (temporary execution file)`);
                    continue;
                }

                // 중요 디렉토리 건너뛰기
                if (['node_modules', 'backup', 'temp', 'temp_update', 'run.bat'].includes(file)) {
                    console.log(`Skipping ${file} (protected directory)`);
                    continue;
                }
                console.log(`Processing ${file}`);
                try {
                    // 기존 파일/디렉토리 삭제
                    if (fs.existsSync(targetPath)) {
                        if (fs.statSync(targetPath).isDirectory()) {
                            fs.rmSync(targetPath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(targetPath);
                        }
                    }

                    // 파일/디렉토리 복사
                    if (fs.statSync(sourcePath).isDirectory()) {
                        fs.cpSync(sourcePath, targetPath, { recursive: true });
                    } else {
                        fs.copyFileSync(sourcePath, targetPath);
                    }

                    console.log(`Updated: ${file}`);
                } catch (fileError) {
                    console.error(`Failed to update ${file}:`, fileError.message);
                    // 개별 파일 실패는 전체 업데이트를 중단시키지 않음
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
                console.log('Cleaned up: update.zip');
            }

            // 임시 디렉토리 삭제
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log('Cleaned up: temp_update directory');
            }

            console.log('Cleanup completed');
        } catch (error) {
            console.error('Cleanup failed:', error.message);
        }
    }

    async performUpdate() {
        if (!this.config) {
            await this.loadConfig();
        }

        let zipPath = null;
        let tempDir = null;

        try {
            const updateInfo = await this.checkForUpdates();

            if (!updateInfo.hasUpdate) {
                console.log(updateInfo.message || 'No updates available');
                return false;
            }

            console.log('Downloading update...');
            zipPath = await this.downloadUpdate(updateInfo.downloadUrl);

            console.log('Extracting update...');
            const { sourceDir, tempDir: extractedTempDir } = await this.extractUpdate(zipPath);
            tempDir = extractedTempDir;

            console.log('Applying update...');
            await this.applyUpdate(sourceDir);

            console.log('Release notes:');
            console.log(updateInfo.releaseNotes || 'No release notes available');
            console.log('Update completed successfully! Please restart the application.');

            return true;
        } catch (error) {
            console.error('Update failed:', error.message);
            return false;
        } finally {

            console.log('Cleaning up...');
            console.log('zipPath:', zipPath);
            console.log('tempDir:', tempDir);
            if (zipPath && tempDir) {
                await this.cleanup(zipPath, tempDir);
            } else {
                console.log('Cleanup skipped - zipPath or tempDir is null/undefined');
            }
        }
    }
}

// 기본 실행 로직
const updater = new AutoUpdater();
updater.performUpdate().catch(console.error);