import config from '../../config.js';
import { avatarImagePath } from './AvatarTextures.js';
import { createTrack } from './marbleTrack.js';
import MarblePhysics from './MarblePhysics.js';

export default class GameController {
    constructor() {
        this.game = null;
        this.socket = null;
        this.state = null;
        this.canControl = false;
        this.canTakeControl = false;
        this.destroyed = false;
        this.audio = null;
        this.soundEnabled = true;
        this.buttons = new Map();
        this.rosterEntries = new Map();
        this.events = new AbortController();
    }

    async init() {
        document.body.classList.add('game-mode');
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
        this.resetHud();
        document.getElementById('game-take-control').addEventListener('click', () => this.action('take_control'), { signal: this.events.signal });
        document.getElementById('marble-follow')?.addEventListener('click', () => this.game?.scene?.keys?.MarbleGame?.followLeader(), { signal: this.events.signal });
        this.connect();
    }

    async createRenderer() {
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
        if (this.destroyed || !this.canControl || this.game) return;
        const { default: MarbleScene } = await import('./scenes/game/MarbleScene.js');
        if (this.destroyed || !this.canControl || this.game) return;
        document.getElementById('game-sound').textContent = '소리 켜짐';
        this.game = new Phaser.Game({
            type: Phaser.AUTO, width: 960, height: 720, parent: 'game-container',
            backgroundColor: '#0d1c2b', scene: [MarbleScene],
            scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
            render: { antialias: true },
            callbacks: { preBoot: game => { game.registry.set('controller', this); } }
        });
    }

    connect() {
        if (this.destroyed) return;
        const socket = new WebSocket('ws://localhost:' + config.PORT.CHAT_DISPLAY + '/?game=marble');
        this.socket = socket;
        socket.onmessage = event => {
            if (this.destroyed || this.socket !== socket) return;
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message.messageType !== 'marble_state') return;
            this.receiveSession(message);
        };
        socket.onclose = event => {
            if (this.socket !== socket || this.destroyed) return;
            this.canControl = false;
            this.canTakeControl = false;
            this.stopRenderer();
            this.updateHud();
            if (event.code === 1000) {
                document.getElementById('game-connection').textContent = '게임이 종료되었습니다.';
                return;
            }
            document.getElementById('game-connection').textContent = '재연결 중…';
            this.retry = setTimeout(() => this.connect(), 2000);
        };
        socket.onerror = () => socket.close();
    }

    receiveSession(message) {
        const session = message.state;
        this.canControl = message.canControl;
        this.canTakeControl = message.canTakeControl;
        if (!this.canControl) this.stopRenderer();
        const obstacles = this.canControl ? (this.obstacles ??= createTrack()) : [];
        if (this.canControl && session.phase === 'racing') {
            this.physics ??= new MarblePhysics(session.roster, obstacles);
        } else if (!this.canControl || session.phase !== 'finished') {
            this.physics = null;
        }
        this.state = {
            ...session,
            ...(this.physics?.state ?? { elapsed: 0, balls: [], results: [], timedOut: false }),
            track: { maxPlayers: session.maxPlayers }, obstacles
        };
        if (this.canControl) {
            this.game?.scene?.keys?.MarbleGame?.receive(this.state);
            this.createRenderer().catch(() => {
                if (!this.destroyed && this.canControl) {
                    document.getElementById('game-connection').textContent = '게임 화면을 불러오지 못했습니다.';
                }
            });
        }
        this.updateHud();
    }

    advanceRace(delta) {
        if (!this.physics || !this.canControl || this.state.paused || this.state.phase !== 'racing') return 1;
        const alpha = this.physics.advance(delta);
        const race = this.physics.state;
        this.state.elapsed = race.elapsed;
        if (race.phase === 'finished') {
            this.state.phase = 'finished';
            this.state.timedOut = race.timedOut;
            this.playFinishSound();
            this.action('finish');
        }
        return alpha;
    }

    stopRenderer() {
        this.game?.destroy(true);
        this.game = null;
        this.physics = null;
        this.obstacles = null;
        this.state = null;
    }

    action(action) {
        const allowed = action === 'take_control' ? this.canTakeControl : this.canControl;
        if (!allowed || this.socket?.readyState !== WebSocket.OPEN) return;
        const payload = { messageType: 'marble_action', action };
        if (action === 'start') {
            const input = document.getElementById('marble-max-players');
            if (!input.reportValidity()) return;
            payload.maxPlayers = Number(input.value);
        }
        this.socket.send(JSON.stringify(payload));
    }

    resetHud() {
        document.body.classList.add('marble-mode');
        document.getElementById('game-take-control').hidden = true;
        document.getElementById('game-control-warning').hidden = true;
        const set = (id, value) => { document.getElementById(id).textContent = value; };
        set('game-title', '굴려굴려게임');
        set('game-eyebrow', 'MARBLE RACE · 누구나 역전할 수 있어요');
        set('game-health', '0명');
        set('game-wave', '0.0초');
        set('game-blocked', '0');
        set('game-phase', '서버 연결 중…');
        set('game-scores', '');
        set('game-participants', '0명');
        set('game-avatar-status', '');
        this.rosterEntries.clear();
        this.rosterSignature = undefined;
        document.getElementById('game-roster').replaceChildren();
        for (const button of this.buttons.values()) button.disabled = true;
        this.buttons.get('pause').textContent = '일시정지';
        document.getElementById('marble-finish-list').replaceChildren();
        this.finishSignature = undefined;
        document.getElementById('marble-finish-empty').hidden = false;
        set('marble-finish-count', '0명');
    }

    updateHud() {
        const state = this.state;
        const set = (id, value) => { document.getElementById(id).textContent = value; };
        for (const [action, button] of this.buttons) {
            const allowed = state && ({ start: ['idle', 'finished'].includes(state.phase), launch: state.phase === 'recruiting' && state.entrants > 0 && !state.paused,
                pause: ['recruiting', 'racing'].includes(state.phase), reset: state.phase !== 'idle' })[action];
            button.disabled = !this.canControl || !allowed;
        }
        this.buttons.get('pause').textContent = state?.paused ? '계속하기' : '일시정지';
        set('game-connection', this.canControl ? '스트리머 진행 가능' : '관전 모드');
        document.getElementById('game-take-control').hidden = !this.canTakeControl;
        const blocked = Boolean(state && !this.canControl);
        document.getElementById('game-control-warning').hidden = !blocked;
        document.getElementById('game-control-warning').textContent = this.canTakeControl
            ? '다른 YoBot 탭 또는 창에서 게임을 열었습니다. 여기서 진행하려면 ‘조작권 가져오기’를 누르세요.'
            : '다른 YoBot 탭 또는 창에서 게임을 진행 중입니다.';
        document.getElementById('game-stage').hidden = !this.canControl;
        if (!state) return;
        document.getElementById('marble-max-players').disabled = !this.canControl || !['idle', 'finished'].includes(state.phase);
        set('game-health', state.entrants + ' / ' + state.track.maxPlayers + '명');
        set('game-wave', state.elapsed.toFixed(1) + '초');
        set('game-blocked', state.results.length + ' / ' + state.balls.length);
        const phase = { idle: '정원을 설정하고 참가 모집을 눌러 주세요.', recruiting: '!참여 / !참가로 접수 중 · 명단 확인 후 경주 시작을 눌러 주세요.',
            racing: '회전 막대와 범퍼를 지나 결승선까지! 누가 먼저 도착할까요?', finished: state.timedOut ? '경주 종료 · 제한 시간 내 미완주자는 순위에서 제외됩니다.' : '전원 완주! 1등 · ' + (state.results[0]?.nickname || '') };
        set('game-phase', state.paused ? '일시정지 · 계속하기를 눌러 주세요.' : phase[state.phase]);
        this.updateRoster(state.roster);
        set('game-participants', state.entrants + '명 · 고유 ID 중복 제외 · NPC 없음');
        const finishSignature = state.results.map(person => encodeURIComponent(person.key)).join('|');
        if (this.finishSignature !== finishSignature) {
            const list = document.getElementById('marble-finish-list');
            if (!this.finishSignature || !finishSignature.startsWith(this.finishSignature + '|')) list.replaceChildren();
            this.finishSignature=finishSignature;
            set('marble-finish-count',state.results.length+'명');
            document.getElementById('marble-finish-empty').hidden=state.results.length>0;
            list.append(...state.results.slice(list.childElementCount).map(person => {
                const row = document.createElement('li');
                const rank = document.createElement('b');
                const name = document.createElement('span');
                const time = document.createElement('small');
                const entrant = state.roster.find(entry => entry.key === person.key);
                rank.textContent = person.rank + '위';
                name.textContent = person.nickname;
                name.title = person.nickname;
                time.textContent = person.time.toFixed(2) + '초';
                row.append(rank, this.createProfileBall(entrant), name, time);
                return row;
            }));
        }
        const avatars = this.game?.scene?.keys?.MarbleGame?.avatarTextures?.cache;
        const photos = state.balls.filter(person => avatars?.get(person.key)).length;
        set('game-avatar-status', state.balls.length ? '사진 공 ' + photos + '개 · 기본 공 ' + (state.balls.length - photos) + '개' : '프로필 이미지는 원형 공으로, 없으면 색깔 공으로 참가합니다.');
        const leaders = [...state.balls].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || b.y - a.y).slice(0, 6);
        set('game-scores', leaders.length ? leaders.map((person, index) => (person.rank ? person.rank + '위 ' : '현재 ' + (index + 1) + '위 ') + person.nickname + (person.time != null ? ' · ' + person.time.toFixed(2) + '초' : '')).join('   |   ') : '출발하면 실시간 순위가 표시됩니다.');
    }

    updateRoster(roster) {
        const signature = JSON.stringify(roster.map(person => [person.key, person.nickname, person.avatarUrl]));
        if (signature === this.rosterSignature) return;
        this.rosterSignature = signature;

        const entries = new Map();
        for (const person of roster) {
            let entry = this.rosterEntries.get(person.key);
            if (!entry || entry.nickname !== person.nickname || entry.avatarUrl !== person.avatarUrl) {
                const tile = document.createElement('div');
                tile.className = 'roster-player';
                tile.title = person.nickname;

                const name = document.createElement('span');
                name.className = 'roster-name';
                name.textContent = person.nickname;
                tile.append(this.createProfileBall(person), name);
                entry = { tile, nickname: person.nickname, avatarUrl: person.avatarUrl };
            }
            entries.set(person.key, entry);
        }
        this.rosterEntries = entries;
        document.getElementById('game-roster').replaceChildren(...Array.from(entries.values(), entry => entry.tile));
    }

    createProfileBall(person) {
        const ball = document.createElement('span');
        ball.className = 'roster-ball';
        ball.setAttribute('aria-hidden', 'true');
        if (person?.avatarUrl || person?.avatarLookup) {
            const image = document.createElement('img');
            image.alt = '';
            image.addEventListener('error', () => image.remove(), { once: true });
            image.src = avatarImagePath(person);
            ball.append(image);
        }
        return ball;
    }

    unlockSound() {
        if (!this.audio && (window.AudioContext || window.webkitAudioContext)) {
            this.audio = new (window.AudioContext || window.webkitAudioContext)();
        }
        this.audio?.resume();
    }

    playFinishSound() {
        if (!this.soundEnabled || this.audio?.state !== 'running') return;
        [523, 659, 784, 1047].forEach((frequency, index) => {
            const oscillator = this.audio.createOscillator();
            const gain = this.audio.createGain();
            const begin = this.audio.currentTime + index * 0.075;
            oscillator.type = 'sine';
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
        this.rosterEntries.clear();
        document.getElementById('game-roster').replaceChildren();
        document.body.classList.remove('game-mode', 'marble-mode');
        clearTimeout(this.retry);
        this.socket?.close(1000);
        this.socket = null;
        this.audio?.close();
        this.audio = null;
        this.stopRenderer();
    }
}
