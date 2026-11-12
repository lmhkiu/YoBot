// One bounded, cached circular texture per participant; never clip or mask every frame.
export default class AvatarTextures {
    constructor(scene, { fetchImage = (...args) => fetch(...args), decodeImage = (...args) => createImageBitmap(...args) } = {}) {
        this.scene = scene; this.fetchImage = fetchImage; this.decodeImage = decodeImage;
        this.pending = new Map(); this.cache = new Map(); this.controllers = new Set(); this.queue = []; this.active = 0; this.destroyed = false;
    }
    get(person) {
        if (!person.avatarUrl || this.destroyed) return Promise.resolve(null);
        if (this.cache.has(person.key)) return Promise.resolve(this.cache.get(person.key));
        if (this.pending.has(person.key)) return this.pending.get(person.key);
        const promise = this.load(person).finally(() => this.pending.delete(person.key));
        this.pending.set(person.key, promise); return promise;
    }
    async load(person) {
        if (this.active >= 4) await new Promise(resolve => this.queue.push(resolve));
        if (this.destroyed) return null;
        this.active++;
        const controller = new AbortController(); this.controllers.add(controller);
        let bitmap, key = null;
        try {
            const response = await this.fetchImage('/api/game/avatar/' + encodeURIComponent(person.platform) + '/' + encodeURIComponent(person.userId), {
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
            });
            if (!response.ok) throw Error('No avatar');
            bitmap = await this.decodeImage(await response.blob(), { resizeWidth: 96, resizeQuality: 'medium' });
            if (this.destroyed || !bitmap.width || !bitmap.height) return null;
            key = 'marble-avatar-' + person.key;
            const texture = this.scene.textures.createCanvas(key, 64, 64);
            const ctx = texture.getContext(); const crop = Math.min(bitmap.width, bitmap.height);
            ctx.save(); ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(bitmap, (bitmap.width - crop)/2, (bitmap.height - crop)/2, crop, crop, 2, 2, 60, 60); ctx.restore();
            ctx.strokeStyle = '#f2fff9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.stroke();
            texture.refresh();
        } catch (error) {
            if (error.message !== 'No avatar' && !this.destroyed) console.debug('Marble avatar unavailable:', error.name, error.message);
            if (key && this.scene?.textures.exists(key)) this.scene.textures.remove(key);
            key = null;
        }
        finally { bitmap?.close(); this.controllers.delete(controller); this.active--; this.queue.shift()?.(); }
        if (!this.destroyed) this.cache.set(person.key, key);
        return this.destroyed ? null : key;
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true; for (const controller of this.controllers) controller.abort();
        for (const resolve of this.queue.splice(0)) resolve(); this.controllers.clear(); this.pending.clear();
        for (const key of this.cache.values()) if (key && this.scene.textures.exists(key)) this.scene.textures.remove(key);
        this.cache.clear(); this.scene = null;
    }
}
