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
            
            execSync(`xcopy "${process.cwd()}" "${backupPath}" /E /I /H /Y`, { stdio: 'inherit' });
            
            console.log(`Backup created at: ${backupPath}`);
            return true;
        } catch (error) {
            console.error('Failed to create backup:', error.message);
            return false;
        }
    }

    async downloadUpdate(downloadUrl) {
        try {
            const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
            return response.data;
        } catch (error) {
            console.error('Failed to download update:', error.message);
            throw error;
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
        const updateData = await this.downloadUpdate(updateInfo.downloadUrl);

        // 여기서 실제 업데이트 압축 해제 및 적용 로직을 구현해야 합니다
        console.log('Update downloaded. Manual installation required.');
        console.log('Release notes:', updateInfo.releaseNotes);
        
        return true;
    }
}

// 기본 실행 로직
if (import.meta.url === `file://${process.argv[1]}`) {
    const updater = new AutoUpdater();
    updater.performUpdate().catch(console.error);
}

export default AutoUpdater;