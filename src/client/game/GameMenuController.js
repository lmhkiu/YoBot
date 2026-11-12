import GameController from './GameController.js';

export default class GameMenuController {
    constructor() { this.events = new AbortController(); this.session = null; this.destroyed = false; }
    async init() {
        document.body.classList.add('game-mode');
        this.showMenu();
        for (const button of document.querySelectorAll('[data-game-select]')) {
            button.addEventListener('click', () => this.select(button.dataset.gameSelect), { signal: this.events.signal });
        }
        document.getElementById('game-menu-back').addEventListener('click', () => this.back(), { signal: this.events.signal });
    }
    showMenu() {
        document.getElementById('game-menu').hidden = false;
        document.getElementById('game-play').hidden = true;
        document.getElementById('game-menu-back').hidden = true;
        document.getElementById('game-title').textContent = '오늘은 어떤 게임을 할까요?';
        document.getElementById('game-eyebrow').textContent = 'JUDY’S PLAYROOM';
        document.getElementById('game-connection').textContent = '게임 선택';
    }
    async select(type) {
        if (this.destroyed || this.session || !['pepero', 'marble'].includes(type)) return;
        const controller = new GameController(type); this.session = controller;
        document.getElementById('game-menu').hidden = true;
        document.getElementById('game-play').hidden = false;
        document.getElementById('game-menu-back').hidden = false;
        document.getElementById('game-connection').textContent = '서버 연결 중…';
        try { await controller.init(); }
        catch (error) {
            controller.destroy();
            if (this.session === controller) { this.session = null; if (!this.destroyed) { this.showMenu(); document.getElementById('game-menu-error').textContent = error.message; } }
        }
    }
    back() {
        if (this.destroyed) return;
        this.session?.destroy(); this.session = null;
        document.body.classList.add('game-mode');
        this.showMenu();
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true; this.events.abort(); this.session?.destroy(); this.session = null;
        document.body.classList.remove('game-mode', 'marble-mode');
    }
}
