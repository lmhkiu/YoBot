import fs from 'node:fs/promises';
import path from 'node:path';

// The previous installer keeps config.js when upgrading to the new release.
export async function migrateHistoryLimit(root, limit) {
    const directory = path.join(root, '.update');
    const marker = path.join(directory, 'history-limit-9999');
    try {
        await fs.access(marker);
        return limit;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    await fs.mkdir(directory, { recursive: true });
    if (limit === 999) {
        const configPath = path.join(root, 'config.js');
        const source = await fs.readFile(configPath, 'utf8');
        const updated = source.replace(
            /((?:"CHAT_HISTORY"|'CHAT_HISTORY'|\bCHAT_HISTORY)\s*:\s*\{[^{}]*?(?:"MAX_MESSAGES_PER_USER"|'MAX_MESSAGES_PER_USER'|\bMAX_MESSAGES_PER_USER)\s*:\s*)999(?=\s*[,}])/,
            (_, prefix) => prefix + '9999'
        );
        if (updated === source) throw new Error('기존 채팅 보관량을 config.js에서 찾지 못했습니다.');
        const temporary = path.join(directory, 'config-history-' + process.pid + '.tmp');
        try {
            await fs.writeFile(temporary, updated);
            await fs.rename(temporary, configPath);
        } finally {
            await fs.rm(temporary, { force: true });
        }
    }
    await fs.writeFile(marker, '');
    return limit === 999 ? 9999 : limit;
}
