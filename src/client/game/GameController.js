import config from '../../config.js';
import { avatarImagePath } from './AvatarTextures.js';
import { MARBLE_VIEW_HEIGHT, TRACK, getMarbleTrack } from './marbleTrack.js';
import MarblePhysics from './MarblePhysics.js';

const RACE_MUSIC = new URL('../assets/game/marble/race-groove.mp3', import.meta.url);

export default class GameController {
    static musicVolume = 31;

    constructor(mapId) {
        this.requestedMap = getMarbleTrack(mapId);
        this.map = this.requestedMap;
        this.game = null;
        this.socket = null;
        this.state = null;
        this.canControl = false;
        this.canTakeControl = false;
        this.destroyed = false;
        this.audio = null;
        this.music = null;
        this.soundEnabled = true;
        this.musicEnabled = true;
        this.buttons = new Map();
        this.rosterEntries = new Map();
        this.rankingEntries = new Map();
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
        const soundButton = document.getElementById('game-sound');
        soundButton.textContent = '효과음 켜짐';
        soundButton.setAttribute('aria-pressed', 'true');
        soundButton.addEventListener('click', () => {
            this.soundEnabled = !this.soundEnabled;
            soundButton.textContent = this.soundEnabled ? '효과음 켜짐' : '효과음 꺼짐';
            soundButton.setAttribute('aria-pressed', String(this.soundEnabled));
            this.unlockSound();
        }, { signal: this.events.signal });
        const musicButton = document.getElementById('game-music');
        musicButton.textContent = '배경음악 켜짐';
        musicButton.setAttribute('aria-pressed', 'true');
        musicButton.addEventListener('click', () => {
            this.musicEnabled = !this.musicEnabled;
            musicButton.textContent = this.musicEnabled ? '배경음악 켜짐' : '배경음악 꺼짐';
            musicButton.setAttribute('aria-pressed', String(this.musicEnabled));
            this.syncMusic();
        }, { signal: this.events.signal });
        const volumeSlider = document.getElementById('game-music-volume');
        const volumeValue = document.getElementById('game-music-volume-value');
        const updateVolume = () => {
            const volume = GameController.musicVolume;
            volumeValue.textContent = `${volume}%`;
            volumeSlider.setAttribute('aria-valuetext', volumeValue.textContent);
            if (this.music) this.music.volume = volume / 100;
        };
        volumeSlider.value = GameController.musicVolume;
        updateVolume();
        volumeSlider.addEventListener('input', () => {
            GameController.musicVolume = volumeSlider.valueAsNumber;
            updateVolume();
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
        const map = this.map;
        const { default: MarbleScene } = map.id === 'moon' ? await import('./scenes/game/MoonMarbleScene.js') :
            await import('./scenes/game/MarbleScene.js');
        if (this.destroyed || !this.canControl || this.game || this.map !== map) return;
        this.game = new Phaser.Game({
            type: Phaser.AUTO, width: TRACK.width, height: MARBLE_VIEW_HEIGHT, parent: 'game-container',
            backgroundColor: map.id === 'moon' ? '#111e35' : '#0d1c2b', scene: [MarbleScene],
            scale: { mode: Phaser.Scale.RESIZE },
            render: { antialias: true },
            callbacks: { preBoot: game => { game.registry.set('controller', this); } }
        });
    }

    connect() {
        if (this.destroyed) return;
        const socket = new WebSocket('ws://localhost:' + config.PORT.CHAT_DISPLAY + '/?game=marble&map=' + this.requestedMap.id);
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
        const map = getMarbleTrack(session.mapId ?? this.requestedMap.id);
        if (!this.canControl || this.map !== map) this.stopRenderer();
        this.map = map;
        document.body.classList.toggle('moon-mode', map.id === 'moon' && this.canControl);
        document.getElementById('game-title').textContent = map.title;
        const obstacles = this.canControl ? (this.obstacles ??= map.createTrack()) : [];
        if (this.canControl && session.phase === 'racing') {
            this.physics ??= new MarblePhysics(session.roster, obstacles, Math.random, map);
        } else if (!this.canControl || session.phase !== 'finished') {
            this.physics = null;
        }
        this.state = {
            ...session,
            ...(this.physics?.state ?? { elapsed: 0, balls: [], results: [], timedOut: false }),
            track: { maxPlayers: session.maxPlayers }, obstacles
        };
        this.syncMusic();
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
            this.syncMusic();
            this.playFinishSound();
            this.action('finish');
        }
        return alpha;
    }

    stopRenderer() {
        this.stopMusic();
        const scene = this.game?.scene?.keys?.MarbleGame;
        scene?.avatarTextures?.destroy();
        if (scene?.load) this.cancelRendererLoads(scene.load);
        this.game?.destroy(true);
        this.game = null;
        this.physics = null;
        this.obstacles = null;
        this.state = null;
    }

    cancelRendererLoads(loader) {
        // Phaser clears its loader sets on destroy without aborting the underlying requests.
        for (const files of [loader.inflight, loader.queue]) {
            for (const file of files?.entries ?? []) {
                const xhr = file.xhrLoader;
                if (typeof xhr?.abort === 'function') {
                    xhr.onload = xhr.onerror = xhr.onprogress = xhr.ontimeout = null;
                    xhr.abort();
                }
                const image = file.data;
                if (image?.tagName === 'IMG') {
                    image.onload = image.onerror = null;
                    if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src);
                    image.removeAttribute('src');
                }
            }
        }
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
        if (action === 'launch' && this.state?.phase === 'recruiting' && !this.state.paused && this.state.entrants > 0) {
            this.syncMusic(true);
        }
    }

    resetHud() {
        document.body.classList.add('marble-mode');
        document.getElementById('game-take-control').hidden = true;
        document.getElementById('game-control-warning').hidden = true;
        const set = (id, value) => { document.getElementById(id).textContent = value; };
        set('game-title', this.requestedMap.title);
        set('game-eyebrow', 'MARBLE RACE · 누구나 역전할 수 있어요');
        set('game-health', '0명');
        set('game-wave', '0.0초');
        set('game-blocked', '0');
        set('game-phase', '서버 연결 중…');
        set('game-participants', '0명');
        set('game-avatar-status', '');
        this.clearParticipantLists();
        for (const button of this.buttons.values()) button.disabled = true;
        this.buttons.get('pause').textContent = '일시정지';
        document.getElementById('marble-follow').disabled = true;
        document.getElementById('marble-finish-empty').hidden = false;
        set('marble-finish-count', '0명 완주');
    }

    clearParticipantLists() {
        for (const id of ['game-roster', 'marble-finish-list']) {
            const list = document.getElementById(id);
            for (const image of list.querySelectorAll('img[src]')) image.removeAttribute('src');
            list.replaceChildren();
        }
        this.rosterEntries.clear();
        this.rosterSignature = undefined;
        this.rankingEntries.clear();
        this.rankingSignature = undefined;
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
        document.getElementById('marble-follow').disabled = !this.canControl;
        if (!state) return;
        document.getElementById('marble-max-players').disabled = !this.canControl || !['idle', 'finished'].includes(state.phase);
        set('game-health', state.entrants + ' / ' + state.track.maxPlayers + '명');
        set('game-wave', state.elapsed.toFixed(1) + '초');
        set('game-blocked', state.results.length + ' / ' + state.balls.length);
        const phase = { idle: '', recruiting: '채팅 !참가 / !참여로 접수 중',
            racing: '', finished: state.timedOut ? '제한 시간 종료' : '1등 · ' + (state.results[0]?.nickname || '') };
        set('game-phase', state.paused ? '일시정지 · 계속하기를 눌러 주세요.' : phase[state.phase]);
        this.updateRoster(state.roster, this.canControl && state.phase === 'racing', state.results);
        set('game-participants', state.entrants + '명 · 고유 ID 중복 제외 · NPC 없음');
        this.updateRanking(state);
        const avatars = this.game?.scene?.keys?.MarbleGame?.avatarTextures?.cache;
        const photos = state.balls.filter(person => avatars?.get(person.key)).length;
        set('game-avatar-status', state.balls.length ? '사진 ' + photos + ' · 기본 ' + (state.balls.length - photos) : '');
    }

    updateRanking(state) {
        const canTrack = this.canControl && state.phase === 'racing';
        const ranked = [...state.balls].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || b.progress - a.progress);
        const signature = JSON.stringify([state.phase, canTrack, ranked.map(ball => [ball.key, ball.rank, ball.time])]);
        if (this.rankingSignature === signature) return;
        this.rankingSignature = signature;
        const list = document.getElementById('marble-finish-list');
        const focused = list.contains(document.activeElement) ? document.activeElement : null;
        const entries = new Map();
        const rows = ranked.map((ball, index) => {
            let entry = this.rankingEntries.get(ball.key);
            if (!entry) {
                const row = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button';
                button.addEventListener('click', () => this.followParticipant(ball.key));
                const rank = document.createElement('b');
                const name = document.createElement('span');
                const time = document.createElement('small');
                name.textContent = ball.nickname;
                name.title = ball.nickname;
                button.append(rank, this.createProfileBall(ball), name, time);
                row.append(button);
                entry = { row, button, rank, time };
            }
            const missed = state.phase === 'finished' && !ball.rank;
            entry.rank.textContent = missed ? '–' : (ball.rank ?? index + 1) + '위';
            entry.time.textContent = ball.rank ? ball.time.toFixed(2) + '초' : missed ? '미완주' : '경주 중';
            entry.button.disabled = !canTrack || Boolean(ball.rank);
            const description = `${entry.rank.textContent} ${ball.nickname}, ${entry.time.textContent}`;
            entry.button.setAttribute('aria-label', entry.button.disabled ? description : `${description}, 공 추적`);
            entries.set(ball.key, entry);
            return entry.row;
        });
        this.rankingEntries = entries;
        list.replaceChildren(...rows);
        if (focused && !focused.disabled && list.contains(focused)) focused.focus({ preventScroll: true });
        document.getElementById('marble-finish-empty').hidden = rows.length > 0;
        document.getElementById('marble-finish-count').textContent = state.results.length + '명 완주';
    }

    updateRoster(roster, canTrack, results) {
        const signature = JSON.stringify([canTrack, results.length, roster.map(person => [person.key, person.nickname, person.avatarUrl, person.avatarLookup])]);
        if (signature === this.rosterSignature) return;
        this.rosterSignature = signature;

        const finished = new Set(results.map(person => person.key));
        const entries = new Map();
        for (const person of roster) {
            let entry = this.rosterEntries.get(person.key);
            if (!entry || entry.nickname !== person.nickname || entry.avatarUrl !== person.avatarUrl || entry.avatarLookup !== person.avatarLookup) {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.className = 'roster-player';
                tile.title = person.nickname;
                tile.setAttribute('aria-label', person.nickname + ' 공 추적');
                tile.addEventListener('click', () => this.followParticipant(person.key));

                const name = document.createElement('span');
                name.className = 'roster-name';
                name.textContent = person.nickname;
                tile.append(this.createProfileBall(person), name);
                entry = { tile, nickname: person.nickname, avatarUrl: person.avatarUrl, avatarLookup: person.avatarLookup };
            }
            entry.tile.disabled = !canTrack || finished.has(person.key);
            entries.set(person.key, entry);
        }
        this.rosterEntries = entries;
        document.getElementById('game-roster').replaceChildren(...Array.from(entries.values(), entry => entry.tile));
    }

    followParticipant(key) {
        this.game?.scene?.keys?.MarbleGame?.followParticipant(key);
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

    syncMusic(startingRace = false) {
        if (!this.canControl || (!startingRace && this.state?.phase !== 'racing')) {
            this.stopMusic();
            return;
        }
        if (!this.musicEnabled || this.state.paused) {
            this.music?.pause();
            return;
        }
        if (!this.music) {
            this.music = new Audio(RACE_MUSIC.href);
            this.music.loop = true;
            this.music.volume = GameController.musicVolume / 100;
        }
        if (this.music.paused) this.music.play().catch(() => {});
    }

    stopMusic() {
        if (!this.music) return;
        this.music.pause();
        this.music.removeAttribute('src');
        this.music.load();
        this.music = null;
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
        document.getElementById('game-stage').hidden = true;
        this.clearParticipantLists();
        document.body.classList.remove('game-mode', 'marble-mode', 'moon-mode');
        clearTimeout(this.retry);
        this.socket?.close(1000);
        this.socket = null;
        this.audio?.close();
        this.audio = null;
        this.stopRenderer();
    }
}
