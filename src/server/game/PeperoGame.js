import { normalizeHistoryMessage } from '../history/normalizeHistoryMessage.js';

export default class PeperoGame {
    constructor({ onChange = () => {}, random = Math.random, now = Date.now, excludedNicknames = [] } = {}) {
        this.onChange = onChange;
        this.random = random;
        this.now = now;
        this.excluded = new Set(excludedNicknames);
        this.entrants = new Map();
        this.scores = new Map();
        this.reset();
        this.timer = null;
    }

    reset() {
        this.stopTimer();
        this.entrants.clear();
        this.scores.clear();
        this.state = {
            phase: 'idle', wave: 0, totalWaves: 3, attackCount: 10,
            health: 10, blocked: 0, shieldLane: 1, attacks: [], recruitUntil: 0,
            paused: false, pausedAt: 0, winner: null
        };
        this.lastMove = 0;
        this.emit();
    }

    snapshot() {
        return {
            ...this.state, serverNow: this.now(), entrants: this.entrants.size,
            roster: [...this.entrants.values()].slice(0, 60).map(({ key, ...person }) => person),
            scores: [...this.scores.values()].sort((a, b) => b.hits - a.hits || b.attempts - a.attempts).slice(0, 10)
        };
    }

    emit() { this.onChange(this.snapshot()); }

    start() {
        this.reset();
        this.recruit();
    }

    recruit() {
        this.entrants.clear();
        this.state.phase = 'recruiting';
        this.state.wave++;
        this.state.attacks = [];
        this.state.recruitUntil = this.now() + 15000;
        this.startTimer();
        this.emit();
    }

    acceptChat(message) {
        if (this.state.phase !== 'recruiting' || this.state.paused || this.now() >= this.state.recruitUntil) return;
        const person = normalizeHistoryMessage(message);
        if (!person || this.excluded.has(person.nickname.trim())) return;
        const key = person.platform + ':' + person.userId;
        const command = person.content.trim();
        const lanes = { '!위': 0, '!왼쪽': 0, '!1': 0, '!가운데': 1, '!중간': 1, '!2': 1, '!아래': 2, '!오른쪽': 2, '!3': 2 };
        const match = command.match(/^!공격\s*([123])$/);
        const chosenLane = lanes[command] ?? (match ? Number(match[1]) - 1 : undefined);
        const previous = this.entrants.get(key);
        if (previous && previous.nickname === person.nickname && chosenLane === undefined) return;
        this.entrants.set(key, {
            key, platform: person.platform, userId: person.userId, nickname: person.nickname,
            lane: chosenLane ?? previous?.lane ?? Math.floor(this.random() * 3)
        });
        this.emit();
    }

    launch() {
        if (this.state.phase !== 'recruiting' || this.state.paused) return;
        const shuffled = [...this.entrants.values()];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        shuffled.sort((a, b) => (this.scores.get(a.key)?.attempts || 0) - (this.scores.get(b.key)?.attempts || 0));
        const attackers = shuffled.slice(0, this.state.attackCount);
        while (attackers.length < this.state.attackCount) {
            const index = attackers.length;
            attackers.push({
                key: 'npc:' + this.state.wave + ':' + index, platform: 'npc', userId: null,
                nickname: ['아몬드 도둑', '초코 요정', '딸기 도깨비'][index % 3] + ' ' + (index + 1),
                lane: Math.floor(this.random() * 3)
            });
        }
        const begin = this.now() + 700;
        this.state.attacks = attackers.map((person, index) => {
            if (person.platform !== 'npc') {
                const score = this.scores.get(person.key) || { nickname: person.nickname, platform: person.platform, hits: 0, attempts: 0 };
                score.nickname = person.nickname;
                score.attempts++;
                this.scores.set(person.key, score);
            }
            const spawnAt = begin + index * 1100;
            return {
                ...person, id: this.state.wave + '-' + index, isNpc: person.platform === 'npc',
                spawnAt, impactAt: spawnAt + 2500 + Math.floor(this.random() * 500), outcome: null
            };
        });
        this.state.phase = 'attacking';
        this.emit();
    }

    move(lane) {
        if (!Number.isInteger(lane) || lane < 0 || lane > 2 || this.state.paused) return;
        if (this.now() - this.lastMove < 180 || lane === this.state.shieldLane) return;
        this.lastMove = this.now();
        this.state.shieldLane = lane;
        this.emit();
    }

    pause() {
        if (this.state.paused || !['recruiting', 'attacking'].includes(this.state.phase)) return;
        this.stopTimer();
        this.state.paused = true;
        this.state.pausedAt = this.now();
        this.emit();
    }

    resume() {
        if (!this.state.paused) return;
        const elapsed = this.now() - this.state.pausedAt;
        this.state.recruitUntil += elapsed;
        for (const attack of this.state.attacks) {
            attack.spawnAt += elapsed;
            attack.impactAt += elapsed;
        }
        this.state.paused = false;
        this.startTimer();
        this.emit();
    }

    tick() {
        if (this.state.paused) return;
        const now = this.now();
        if (this.state.phase === 'recruiting' && now >= this.state.recruitUntil) {
            this.launch();
            return;
        }
        if (this.state.phase !== 'attacking') return;
        let changed = false;
        const due = this.state.attacks.filter(attack => !attack.outcome && now >= attack.impactAt)
            .sort((a, b) => a.impactAt - b.impactAt);
        for (const attack of due) {
            attack.outcome = attack.lane === this.state.shieldLane ? 'blocked' : 'hit';
            if (attack.outcome === 'blocked') this.state.blocked++;
            else {
                this.state.health--;
                if (!attack.isNpc) this.scores.get(attack.key).hits++;
            }
            changed = true;
            if (this.state.health <= 0) {
                this.state.phase = 'finished';
                this.state.winner = 'viewers';
                break;
            }
        }
        if (this.state.phase === 'attacking' && this.state.attacks.every(attack => attack.outcome)) {
            this.state.phase = this.state.wave === this.state.totalWaves ? 'finished' : 'between';
            if (this.state.phase === 'finished') this.state.winner = 'streamer';
        }
        if (['between', 'finished'].includes(this.state.phase)) this.stopTimer();
        if (changed) this.emit();
    }

    action(action, lane) {
        if (action === 'start' && ['idle', 'finished'].includes(this.state.phase)) this.start();
        else if (action === 'next' && this.state.phase === 'between') this.recruit();
        else if (action === 'launch') this.launch();
        else if (action === 'lane') this.move(lane);
        else if (action === 'pause') this.pause();
        else if (action === 'resume') this.resume();
        else if (action === 'reset') this.reset();
    }

    startTimer() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), 100);
        this.timer.unref();
    }

    stopTimer() {
        clearInterval(this.timer);
        this.timer = null;
    }

    destroy() {
        this.stopTimer();
        this.entrants.clear();
        this.scores.clear();
        this.state.attacks = [];
    }
}
