const hosts = ['pstatic.net', 'sooplive.co.kr', 'afreecatv.com', 'jtvnw.net'];
export function allowedAvatarUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port && hosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host)) ? url.href : '';
    } catch { return ''; }
}
export function avatarForMessage(message, person) {
    let profile = message.profile;
    try { if (typeof profile === 'string') profile = JSON.parse(profile); } catch { profile = null; }
    const supplied = profile?.profileImageUrl || message.profileImageUrl || message.profile_image_url;
    if (supplied) return allowedAvatarUrl(supplied);
    if (person.platform === 'soop' && /^[a-z0-9_]{2,64}$/i.test(person.userId)) {
        const id = person.userId;
        return 'https://profile.img.sooplive.co.kr/LOGO/' + id.slice(0,2) + '/' + id + '/' + id + '.jpg';
    }
    // Anonymous Twitch IRC has no avatar URL; leave the colored marble unless a URL is supplied.
    return '';
}

export default class AvatarStore {
    constructor({ fetchImage = fetch } = {}) { this.fetchImage = fetchImage; this.cache = new Map(); this.pending = new Map(); this.bytes = 0; this.active = 0; this.queue = []; this.destroyed = false; }
    async get(url) {
        if (!url || !allowedAvatarUrl(url) || this.destroyed) return null;
        if (this.cache.has(url)) return this.cache.get(url);
        if (this.pending.has(url)) return this.pending.get(url).promise;
        const controller = new AbortController();
        const job = { controller };
        job.promise = this.download(url, controller).finally(() => this.pending.delete(url));
        this.pending.set(url, job); return job.promise;
    }
    async download(url, controller) {
        if (this.active >= 4) await new Promise(resolve => this.queue.push(resolve));
        if (this.destroyed) return null;
        this.active++;
        let result = null;
        try {
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]);
            const response = await this.fetchImage(url, { signal, redirect: 'error' });
            const type = response.headers.get('content-type')?.split(';')[0];
            if (!response.ok || !['image/jpeg','image/png','image/webp','image/gif'].includes(type)) throw Error('Unsupported avatar');
            const reader = response.body.getReader(); const chunks = []; let size = 0;
            while (true) {
                const { value, done } = await reader.read(); if (done) break;
                size += value.byteLength; if (size > 4 * 1024 * 1024) { await reader.cancel(); throw Error('Avatar too large'); } chunks.push(value);
            }
            result = { type, data: Buffer.concat(chunks) };
        } catch { /* A missing image never blocks enrollment or the race. */ }
        finally { this.active--; this.queue.shift()?.(); }
        if (this.destroyed) return null;
        const size = result?.data.length || 0;
        while (this.cache.size >= 128 || this.bytes + size > 8 * 1024 * 1024) {
            const first = this.cache.keys().next().value;
            this.bytes -= this.cache.get(first)?.data.length || 0; this.cache.delete(first);
        }
        this.cache.set(url, result); this.bytes += size; return result;
    }
    destroy() {
        this.destroyed = true; for (const job of this.pending.values()) job.controller.abort();
        for (const resolve of this.queue.splice(0)) resolve(); this.pending.clear(); this.cache.clear(); this.bytes = 0;
    }
}
