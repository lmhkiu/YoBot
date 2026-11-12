import config from '../../config.js';

export default class GameController {
    constructor(gameType = 'pepero') {
        this.gameType = gameType;
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
        const { default: PeperoScene } = this.gameType === 'marble'
            ? await import('./scenes/game/MarbleScene.js')
            : await import('./scenes/game/PeperoScene.js');
        if (this.destroyed) return;
        document.getElementById('game-sound').textContent = '소리 켜짐';
        this.game = new Phaser.Game({
            type: Phaser.AUTO, width: 960, height: 720, parent: 'game-container',
            backgroundColor: this.gameType === 'marble' ? '#0d1c2b' : '#f9e9da', scene: [PeperoScene],
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
        this.configureUi();
        document.getElementById('marble-follow')?.addEventListener('click', () => this.game?.scene?.keys?.MarbleGame?.followLeader(), { signal: this.events.signal });
        this.connect();
    }

    connect() {
        if (this.destroyed) return;
        const socket = new WebSocket('ws://localhost:' + config.PORT.CHAT_DISPLAY + '/?game=' + this.gameType);
        this.socket = socket;
        socket.onmessage = event => {
            if (this.destroyed || this.socket !== socket) return;
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message.messageType !== this.gameType + '_state') return;
            this.canControl = message.canControl;
            this.state = message.state;
            this.receivedAt = performance.now();
            this.game?.scene?.keys?.[this.gameType === 'marble' ? 'MarbleGame' : 'PeperoGame']?.receive(message.state);
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
        const payload = { messageType: this.gameType + '_action', action, lane };
        if (this.gameType === 'marble' && action === 'start') {
            const input = document.getElementById('marble-max-players');
            if (!input.reportValidity()) return;
            payload.maxPlayers = Number(input.value);
        }
        this.socket.send(JSON.stringify(payload));
    }

    time() {
        if (!this.state) return Date.now();
        return this.state.paused ? this.state.pausedAt : this.state.serverNow + performance.now() - this.receivedAt;
    }

    updateHud() {
        if (this.gameType === 'marble') { this.updateMarbleHud(); return; }
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

    configureUi() {
        const marble = this.gameType === 'marble';
        document.body.classList.toggle('marble-mode', marble);
        const set = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
        set('game-title', marble ? '굴려굴려게임' : '빼빼로게임 · 주디의 달콤한 수호전');
        set('game-eyebrow', marble ? 'MARBLE RACE · 누구나 역전할 수 있어요' : 'PEPERO DAY · 11.11');
        set('game-stat-one', marble ? '참가자' : '남은 빼빼로');
        set('game-stat-two', marble ? '경주 시간' : '웨이브');
        set('game-stat-three', marble ? '완주' : '막은 공격');
        set('game-health', marble ? '0명' : '10 / 10');
        set('game-wave', marble ? '0.0초' : '0 / 3');
        set('game-blocked', '0');
        set('game-phase', '서버 연결 중…');
        set('game-scores', '');
        document.getElementById('game-roster')?.replaceChildren?.();
        for (const button of this.buttons.values()) button.disabled = true;
        this.buttons.get('pause').textContent = '일시정지';
        set('game-lineup-title', marble ? '참가한 시청자' : '이번 공격대');
        set('game-help', marble ? '!참여 또는 !참가로 참가 · 미니맵 클릭/드래그로 이동 · 공을 누르고 있는 동안 추적' : '주디 · ↑↓ / W·S / 1·2·3 또는 길 클릭 | 시청자 · 모집 중 채팅하면 자동 참가');
        this.buttons.get('next').hidden = marble;
        this.buttons.get('start').textContent = marble ? '참가 모집' : '게임 시작';
        this.buttons.get('launch').textContent = marble ? '경주 시작' : '모집 마감';
        document.getElementById('marble-follow')?.toggleAttribute('hidden', !marble);
        document.getElementById('marble-settings')?.toggleAttribute('hidden', !marble);
        document.getElementById('marble-results')?.toggleAttribute('hidden', !marble);
        document.getElementById('marble-finish-list')?.replaceChildren?.();
        set('marble-finish-count','0명');
        document.getElementById('game-avatar-status')?.toggleAttribute('hidden', !marble);
        document.getElementById('game-container')?.setAttribute('aria-label', marble ? '굴려굴려 경주 화면' : '빼빼로 게임 화면');
    }

    updateMarbleHud() {
        const state = this.state;
        const set = (id, value) => { document.getElementById(id).textContent = value; };
        for (const [action, button] of this.buttons) {
            const allowed = state && ({ start: ['idle', 'finished'].includes(state.phase), launch: state.phase === 'recruiting' && state.entrants > 0 && !state.paused,
                pause: ['recruiting', 'racing'].includes(state.phase), reset: state.phase !== 'idle' })[action];
            button.disabled = !this.canControl || !allowed;
        }
        this.buttons.get('pause').textContent = state?.paused ? '계속하기' : '일시정지';
        set('game-connection', this.canControl ? '스트리머 진행 가능' : '관전 모드');
        if (!state) return;
        document.getElementById('marble-max-players').disabled = !this.canControl || !['idle', 'finished'].includes(state.phase);
        set('game-health', state.entrants + ' / ' + state.track.maxPlayers + '명');
        set('game-wave', state.elapsed.toFixed(1) + '초');
        set('game-blocked', state.results.length + ' / ' + state.balls.length);
        const phase = { idle: '정원을 설정하고 참가 모집을 눌러 주세요.', recruiting: '!참여 / !참가로 접수 중 · 명단 확인 후 경주 시작을 눌러 주세요.',
            racing: '회전 막대와 범퍼를 지나 결승선까지! 누가 먼저 도착할까요?', finished: state.timedOut ? '경주 종료 · 제한 시간 내 미완주자는 순위에서 제외됩니다.' : '전원 완주! 1등 · ' + (state.results[0]?.nickname || '') };
        set('game-phase', state.paused ? '일시정지 · 계속하기를 눌러 주세요.' : phase[state.phase]);
        const signature = state.roster.map(person => person.key + ':' + person.nickname).join('|');
        if (this.rosterSignature !== signature) {
            this.rosterSignature = signature;
            document.getElementById('game-roster').replaceChildren(...state.roster.map(person => {
                const chip = document.createElement('span'); chip.className = 'roster-chip'; chip.textContent = person.nickname; return chip;
            }));
        }
        set('game-participants', state.entrants + '명 · 고유 ID 중복 제외 · NPC 없음');
        const finishSignature=state.results.map(person=>person.key).join('|');
        if(this.finishSignature!==finishSignature) {
            this.finishSignature=finishSignature;
            set('marble-finish-count',state.results.length+'명');
            document.getElementById('marble-finish-empty').hidden=state.results.length>0;
            document.getElementById('marble-finish-list').replaceChildren(...state.results.map(person=>{
                const row=document.createElement('li'), rank=document.createElement('b'), name=document.createElement('span'), time=document.createElement('small');
                rank.textContent=person.rank+'위';name.textContent=person.nickname;name.title=person.nickname;time.textContent=person.time.toFixed(2)+'초';row.append(rank,name,time);return row;
            }));
        }
        const avatars = this.game?.scene?.keys?.MarbleGame?.avatarTextures?.cache;
        const photos = state.balls.filter(person => avatars?.get(person.key)).length;
        set('game-avatar-status', state.balls.length ? '사진 공 ' + photos + '개 · 기본 공 ' + (state.balls.length - photos) + '개' : '프로필 이미지는 원형 공으로, 없으면 색깔 공으로 참가합니다.');
        const leaders = state.ranking.slice(0, 6);
        set('game-scores', leaders.length ? leaders.map((person, index) => (person.rank ? person.rank + '위 ' : '현재 ' + (index + 1) + '위 ') + person.nickname + (person.time != null ? ' · ' + person.time.toFixed(2) + '초' : '')).join('   |   ') : '출발하면 실시간 순위가 표시됩니다.');
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
        document.body.classList.remove('game-mode', 'marble-mode');
        clearTimeout(this.retry);
        this.socket?.close(1000);
        this.socket = null;
        this.audio?.close();
        this.audio = null;
        this.game?.destroy(true);
        this.game = null;
    }
}
