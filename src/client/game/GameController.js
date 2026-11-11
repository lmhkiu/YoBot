import config from '../../config.js';

export default class GameController {
    constructor() {
        this.game = null;
        this.socket = null;
        this.state = null;
        this.canControl = false;
        this.destroyed = false;
        this.audio = null;
        this.soundEnabled = true;
        this.buttons = new Map();
        this.events = new AbortController();
    }

    async init() {
        document.body.classList.add('game-mode');
        if (!window.Phaser) {
            GameController.engineReady ??= new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'lib/phaser.js';
                script.onload = resolve;
                script.onerror = () => {
                    script.remove();
                    GameController.engineReady = null;
                    reject(new Error('게임 엔진을 불러오지 못했습니다.'));
                };
                document.head.append(script);
            });
            await GameController.engineReady;
        }
        if (this.destroyed) return;
        const { default: PeperoScene } = await import('./scenes/game/PeperoScene.js');
        if (this.destroyed) return;
        document.getElementById('game-sound').textContent = '소리 켜짐';
        this.game = new Phaser.Game({
            type: Phaser.AUTO, width: 960, height: 720, parent: 'game-container',
            backgroundColor: '#f9e9da', scene: [PeperoScene],
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
            render: { antialias: true },
            callbacks: { preBoot: game => { game.registry.set('controller', this); } }
        });
        for (const button of document.querySelectorAll('[data-game-action]')) {
            const action = button.dataset.gameAction;
            this.buttons.set(action, button);
            button.addEventListener('click', () => {
                this.unlockSound();
                if (action === 'pause') this.action(this.state?.paused ? 'resume' : 'pause');
                else this.action(action);
            }, { signal: this.events.signal });
        }
        document.getElementById('game-sound').addEventListener('click', event => {
            this.soundEnabled = !this.soundEnabled;
            event.currentTarget.textContent = this.soundEnabled ? '소리 켜짐' : '소리 꺼짐';
            this.unlockSound();
        }, { signal: this.events.signal });
        this.connect();
    }

    connect() {
        if (this.destroyed) return;
        const socket = new WebSocket('ws://localhost:' + config.PORT.CHAT_DISPLAY + '/?game=pepero');
        this.socket = socket;
        socket.onmessage = event => {
            if (this.destroyed || this.socket !== socket) return;
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message.messageType !== 'pepero_state') return;
            this.canControl = message.canControl;
            this.state = message.state;
            this.receivedAt = performance.now();
            this.game?.scene?.keys?.PeperoGame?.receive(message.state);
            this.updateHud();
        };
        socket.onclose = event => {
            if (this.socket !== socket || this.destroyed) return;
            this.canControl = false;
            this.updateHud();
            if (event.code === 1000) {
                document.getElementById('game-connection').textContent = '게임이 종료되었습니다.';
                return;
            }
            document.getElementById('game-connection').textContent = '재연결 중 · 게임은 일시정지됩니다';
            this.retry = setTimeout(() => this.connect(), 2000);
        };
        socket.onerror = () => socket.close();
    }

    action(action, lane) {
        if (!this.canControl || this.socket?.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify({ messageType: 'pepero_action', action, lane }));
    }

    time() {
        if (!this.state) return Date.now();
        return this.state.paused ? this.state.pausedAt : this.state.serverNow + performance.now() - this.receivedAt;
    }

    updateHud() {
        const state = this.state;
        const active = state && ['recruiting', 'attacking'].includes(state.phase);
        for (const [action, button] of this.buttons) {
            const allowed = state && ({
                start: ['idle', 'finished'].includes(state.phase),
                next: state.phase === 'between',
                launch: state.phase === 'recruiting' && !state.paused,
                pause: active,
                reset: state.phase !== 'idle'
            })[action];
            button.disabled = !this.canControl || !allowed;
        }
        this.buttons.get('pause').textContent = state?.paused ? '계속하기' : '일시정지';
        document.getElementById('game-connection').textContent = this.canControl ? '스트리머 조작 가능' : '관전 모드';
        if (!state) return;
        document.getElementById('game-health').textContent = state.health + ' / 10';
        document.getElementById('game-wave').textContent = state.wave + ' / ' + state.totalWaves;
        document.getElementById('game-blocked').textContent = state.blocked;
        const phase = {
            idle: '게임 시작을 눌러 참가자를 모아 주세요.',
            recruiting: '채팅 한 마디면 자동 참가! 방향은 !위 · !가운데 · !아래',
            attacking: '방패를 움직여 빼빼로를 지켜 주세요!',
            between: '이번 공격 종료! 다음 웨이브에서 다시 모집합니다.',
            finished: state.winner === 'streamer' ? '주디 승리! 빼빼로를 지켰어요.' : '시청자 승리! 빼빼로를 모두 먹었어요.'
        };
        const seconds = Math.max(0, Math.ceil((state.recruitUntil - this.time()) / 1000));
        document.getElementById('game-phase').textContent = state.paused ? '일시정지 · 계속하기를 눌러 주세요.' :
            phase[state.phase] + (state.phase === 'recruiting' ? ' (' + seconds + '초)' : '');
        const roster = document.getElementById('game-roster');
        const people = state.phase === 'recruiting' ? state.roster : state.attacks;
        const signature = people.map(person => person.platform + ':' + (person.userId || person.nickname) + ':' + person.lane).join('|');
        if (signature !== this.rosterSignature) {
            this.rosterSignature = signature;
            roster.replaceChildren(...people.map(person => {
                const chip = document.createElement('span');
                chip.className = 'roster-chip' + (person.platform === 'npc' ? ' npc' : '');
                chip.textContent = (person.platform === 'npc' ? 'NPC ' : '') + person.nickname;
                chip.title = ({ chzzk: '치지직', soop: '숲', twitch: '트위치', npc: '게임 캐릭터' })[person.platform];
                return chip;
            }));
        }
        const viewers = state.attacks.filter(person => !person.isNpc).length;
        document.getElementById('game-participants').textContent = state.phase === 'recruiting'
            ? state.entrants + '명 모집 · 공격 10자리'
            : '시청자 ' + viewers + '명 · NPC ' + (state.attacks.length - viewers) + '명';
        const scores = document.getElementById('game-scores');
        scores.textContent = state.scores.length
            ? state.scores.map((score, index) => (index + 1) + '. ' + score.nickname + ' ' + score.hits + '입').join('   ·   ')
            : '공격에 성공한 시청자의 기록이 여기에 표시됩니다.';
    }

    unlockSound() {
        if (!this.audio && (window.AudioContext || window.webkitAudioContext)) {
            this.audio = new (window.AudioContext || window.webkitAudioContext)();
        }
        this.audio?.resume();
    }

    sound(kind) {
        if (!this.soundEnabled || this.audio?.state !== 'running') return;
        const notes = { block: [880, 1320], hit: [220, 110], start: [523, 659, 784], win: [523, 659, 784, 1047] };
        (notes[kind] || notes.block).forEach((frequency, index) => {
            const oscillator = this.audio.createOscillator();
            const gain = this.audio.createGain();
            const begin = this.audio.currentTime + index * 0.075;
            oscillator.type = kind === 'hit' ? 'triangle' : 'sine';
            oscillator.frequency.setValueAtTime(frequency, begin);
            gain.gain.setValueAtTime(0.0001, begin);
            gain.gain.exponentialRampToValueAtTime(0.07, begin + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, begin + 0.16);
            oscillator.connect(gain).connect(this.audio.destination);
            oscillator.start(begin);
            oscillator.stop(begin + 0.17);
        });
    }

    destroy() {
        if (this.destroyed) return;
        this.action('leave');
        this.destroyed = true;
        this.events.abort();
        document.body.classList.remove('game-mode');
        clearTimeout(this.retry);
        this.socket?.close(1000);
        this.socket = null;
        this.audio?.close();
        this.audio = null;
        this.game?.destroy(true);
        this.game = null;
    }
}
