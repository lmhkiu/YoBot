import GameController from './GameController.js';

export default class GameMenuController {
    constructor() { this.events = new AbortController(); this.session = null; this.destroyed = false; }
    async init() {
        document.body.classList.add('game-mode');
        this.showMenu();
        document.getElementById('game-open-maps').addEventListener('click', () => this.showMenu(true), { signal: this.events.signal });
        for (const button of document.querySelectorAll('[data-map-select]')) {
            button.addEventListener('click', () => this.select(button.dataset.mapSelect), { signal: this.events.signal });
        }
        document.getElementById('game-menu-back').addEventListener('click', () => this.back(), { signal: this.events.signal });
    }
    showMenu(chooseMap = false) {
        document.getElementById('game-menu').hidden = false;
        document.getElementById('game-selection').hidden = chooseMap;
        document.getElementById('game-map-selection').hidden = !chooseMap;
        document.getElementById('game-play').hidden = true;
        const backButton = document.getElementById('game-menu-back');
        backButton.hidden = !chooseMap;
        backButton.textContent = '게임 선택';
        document.getElementById('game-title').textContent = chooseMap ? '굴려굴려게임 맵 선택' : '게임 선택';
        document.getElementById('game-eyebrow').textContent = 'JUDY’S PLAYROOM';
        document.getElementById('game-connection').textContent = '';
        document.getElementById('game-menu-error').textContent = '';
    }
    async select(type) {
        if (this.destroyed || this.session || !['marble', 'moon'].includes(type)) return;
        const controller = new GameController(type); this.session = controller;
        document.getElementById('game-menu').hidden = true;
        document.getElementById('game-play').hidden = false;
        document.getElementById('game-menu-back').hidden = false;
        document.getElementById('game-menu-back').textContent = '맵 선택';
        document.getElementById('game-connection').textContent = '서버 연결 중…';
        try { await controller.init(); }
        catch (error) {
            controller.destroy();
            if (this.session === controller) {
                this.session = null;
                if (!this.destroyed) {
                    this.showMenu(true);
                    document.getElementById('game-menu-error').textContent = error.message;
                }
            }
        }
    }
    back() {
        if (this.destroyed) return;
        const wasPlaying = Boolean(this.session);
        this.session?.destroy(); this.session = null;
        document.body.classList.add('game-mode');
        this.showMenu(wasPlaying);
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true; this.events.abort(); this.session?.destroy(); this.session = null;
        document.body.classList.remove('game-mode', 'marble-mode');
    }
}
