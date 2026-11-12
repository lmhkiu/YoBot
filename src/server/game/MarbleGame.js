import AvatarStore, { avatarForMessage } from './AvatarStore.js';
import { normalizeHistoryMessage } from '../history/normalizeHistoryMessage.js';

import { TRACK, createTrack, corridorAt } from '../../client/game/marbleTrack.js';
export { TRACK, createTrack };

export default class MarbleGame {
    constructor({ onChange = () => {}, random = Math.random, now = Date.now, excludedNicknames = [] } = {}) {
        this.onChange = onChange; this.random = random; this.now = now;
        this.excluded = new Set(excludedNicknames); this.entrants = new Map();
        this.avatars = new AvatarStore(); this.maxPlayers = 10; this.obstacles = createTrack(); this.timer = null; this.reset();
    }
    reset() {
        this.stopTimer(); this.entrants.clear(); this.accumulator = 0;
        this.state = { kind: 'marble', phase: 'idle', elapsed: 0, recruitUntil: 0, paused: false, pausedAt: 0, balls: [], results: [], timedOut: false };
        this.emit();
    }
    snapshot() {
        const balls = this.state.balls.map(({ progressAt, progressY, jumped, ...ball }) => ({ ...ball }));
        const ranking = [...balls].sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || b.y - a.y);
        return { ...this.state, gameVersion: 2, joinCommands: ['!참여', '!참가'], balls, ranking: ranking.map(({ key, nickname, platform, rank, time, y }) => ({ key, nickname, platform, rank, time, y })),
            results: this.state.results.map(item => ({ ...item })), serverNow: this.now(), entrants: this.entrants.size,
            roster: [...this.entrants.values()].map(person => ({ ...person })), track: { ...TRACK, maxPlayers: this.maxPlayers }, obstacles: this.obstacles };
    }
    emit() { this.onChange(this.snapshot()); }
    start(maxPlayers = this.maxPlayers) {
        if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > TRACK.maxPlayers) return;
        if (!['idle', 'finished'].includes(this.state.phase)) return;
        this.maxPlayers = maxPlayers;
        this.reset(); this.state.phase = 'recruiting'; this.emit();
    }
    acceptChat(message) {
        if (this.state.phase !== 'recruiting' || this.state.paused) return;
        const person = normalizeHistoryMessage(message);
        if (!person || !['!참여', '!참가'].includes(person.content.trim()) || this.excluded.has(person.nickname.trim())) return;
        const key = person.platform + ':' + person.userId;
        if (!this.entrants.has(key) && this.entrants.size >= this.maxPlayers) return;
        if (this.entrants.get(key)?.nickname === person.nickname) return;
        this.entrants.set(key, { key, platform: person.platform, userId: person.userId, nickname: person.nickname, avatarUrl: avatarForMessage(message, person) });
        this.emit();
    }
    launch() {
        if (this.state.phase !== 'recruiting' || this.state.paused || !this.entrants.size) return;
        const people = [...this.entrants.values()];
        for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [people[i], people[j]] = [people[j], people[i]]; }
        this.state.balls = people.map((person, i) => ({ ...person, x: 105 + (i % 20) * 39 + this.random() * 5,
            y: 120 - Math.floor(i / 20) * 32, vx: (this.random() - 0.5) * 140, vy: 0, color: i % 12, rank: null, time: null,
            progressAt: 0, progressY: 0 }));
        this.state.phase = 'racing'; this.accumulator = 0; this.lastTick = this.now(); this.startTimer(); this.emit();
    }
    startTimer() {
        if (this.timer) return;
        this.lastTick = this.now(); this.timer = setInterval(() => this.tick(), 1000 / 30); this.timer.unref();
    }
    stopTimer() { clearInterval(this.timer); this.timer = null; }
    tick() {
        if (this.state.paused) return;
        if (this.state.phase !== 'racing') return;
        this.accumulator += Math.min(0.25, Math.max(0, (this.now() - this.lastTick) / 1000)); this.lastTick = this.now();
        while (this.accumulator >= 1 / 60 && this.state.phase === 'racing') { this.step(1 / 60); this.accumulator -= 1 / 60; }
        if (!this.sentAt || this.now() - this.sentAt >= 100 || this.state.phase === 'finished') { this.sentAt = this.now(); this.emit(); }
    }
    step(dt) {
        if (this.state.phase !== 'racing' || this.state.paused) return;
        this.state.elapsed += dt;
        const live = this.state.balls.filter(ball => !ball.rank);
        const r = TRACK.radius;
        for (const ball of live) {
            ball.vy = Math.min(530, ball.vy + 310 * dt); ball.vx *= 0.999;
            ball.x += ball.vx * dt; ball.y += ball.vy * dt;
            const road = corridorAt(ball.y);
            const before = corridorAt(ball.y - 1), after = corridorAt(ball.y + 1);
            if (ball.x < road.left + r) {
                ball.x = road.left + r; const slope = (after.left - before.left) / 2;
                const norm = Math.hypot(1, slope), nx = 1 / norm, ny = -slope / norm;
                const speed = ball.vx * nx + ball.vy * ny;
                if (speed < 0) { ball.vx -= 1.5 * speed * nx; ball.vy -= 1.5 * speed * ny; }
            }
            if (ball.x > road.right - r) {
                ball.x = road.right - r; const slope = (after.right - before.right) / 2;
                const norm = Math.hypot(1, slope), nx = -1 / norm, ny = slope / norm;
                const speed = ball.vx * nx + ball.vy * ny;
                if (speed < 0) { ball.vx -= 1.5 * speed * nx; ball.vy -= 1.5 * speed * ny; }
            }
            for (const obstacle of this.obstacles) {
                if (obstacle.type === 'funnel' || obstacle.funnelWall) continue;
                if (Math.abs(ball.y - obstacle.y) > (obstacle.type === 'spiral' ? 350 : obstacle.type === 'funnel' ? 330 : 170)) continue;
                if (obstacle.type === 'spiral') {
                    const angle = obstacle.angle + obstacle.speed * this.state.elapsed, cos = Math.cos(angle), sin = Math.sin(angle);
                    for (const segment of obstacle.segments) {
                        const ax = segment.ax * cos - segment.ay * sin, ay = segment.ax * sin + segment.ay * cos;
                        const bx = segment.bx * cos - segment.by * sin, by = segment.bx * sin + segment.by * cos;
                        this.collideSegment(ball, obstacle.x + ax, obstacle.y + ay, obstacle.x + bx, obstacle.y + by, obstacle);
                    }
                    continue;
                }
                if (obstacle.type === 'jump') {
                    if (ball.vy > 0 && Math.hypot(ball.x-obstacle.x,ball.y-obstacle.y)<obstacle.radius && !(ball.jumped||[]).includes(obstacle.id)) {
                        (ball.jumped??=[]).push(obstacle.id);ball.vy=-560;ball.vx+=(this.random()-0.5)*160;ball.lastJumpAt=this.state.elapsed;
                    }
                } else if (obstacle.type === 'boost') {
                    if (Math.hypot(ball.x - obstacle.x, ball.y - obstacle.y) < obstacle.radius) {
                        ball.vy = Math.min(650, ball.vy + 1150 * dt); ball.vx += (obstacle.x < 480 ? 1 : -1) * 170 * dt;
                    }
                } else if (obstacle.type === 'bumper') this.bounce(ball, obstacle.x, obstacle.y, obstacle.radius + r, 1.03);
                else {
                    const angle = obstacle.angle + (obstacle.speed || 0) * this.state.elapsed;
                    const dx = Math.cos(angle) * obstacle.length / 2, dy = Math.sin(angle) * obstacle.length / 2;
                    this.collideSegment(ball, obstacle.x - dx, obstacle.y - dy, obstacle.x + dx, obstacle.y + dy, obstacle);
                }
            }
            // A resting marble gets a small lateral nudge, without changing its progress.
            if (ball.y > ball.progressY + 35) { ball.progressY = ball.y; ball.progressAt = this.state.elapsed; }
            if (this.state.elapsed - ball.progressAt > 4) { ball.vx += (this.random() - 0.5) * 180; ball.progressAt = this.state.elapsed; }
        }
        // Broad phase grid bounds pair checks for large viewer groups.
        const grid = new Map();
        for (const ball of live) {
            const cx = Math.floor(ball.x / 32), cy = Math.floor(ball.y / 32);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                for (const other of grid.get((cx + dx) + ':' + (cy + dy)) || []) {
                    const distance = Math.hypot(ball.x - other.x, ball.y - other.y);
                    if (distance >= r * 2) continue;
                    const nx = distance > 0.001 ? (ball.x - other.x) / distance : 1, ny = distance > 0.001 ? (ball.y - other.y) / distance : 0;
                    const overlap = (r * 2 - distance) / 2;
                    ball.x += nx * overlap; ball.y += ny * overlap; other.x -= nx * overlap; other.y -= ny * overlap;
                    const speed = (ball.vx - other.vx) * nx + (ball.vy - other.vy) * ny;
                    if (speed < 0) { const impulse = -speed * 0.82; ball.vx += impulse * nx; ball.vy += impulse * ny; other.vx -= impulse * nx; other.vy -= impulse * ny; }
                }
            }
            const key = cx + ':' + cy; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(ball);
        }
        // Resolve crossings by sub-frame crossing time, never by participant array order.
        const crossed = live.filter(ball => ball.y >= TRACK.finish).sort((a, b) =>
            (a.y - TRACK.finish) / Math.max(1, a.vy) - (b.y - TRACK.finish) / Math.max(1, b.vy)).reverse();
        for (const ball of crossed) {
            ball.rank = this.state.results.length + 1;
            ball.time = this.state.elapsed - Math.min(dt, Math.max(0, (ball.y - TRACK.finish) / Math.max(1, ball.vy)));
            this.state.results.push({ key: ball.key, nickname: ball.nickname, platform: ball.platform, rank: ball.rank, time: ball.time });
        }
        if (this.state.results.length === this.state.balls.length || this.state.elapsed >= 360) {
            this.state.phase = 'finished'; this.state.timedOut = this.state.results.length < this.state.balls.length; this.stopTimer();
        }
    }
    collideSegment(ball, ax, ay, bx, by, obstacle) {
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((ball.x - ax) * dx + (ball.y - ay) * dy) / (dx * dx + dy * dy)));
        const px = ax + t * dx, py = ay + t * dy;
        this.bounce(ball, px, py, TRACK.radius + 10, 0.65, -(py - obstacle.y) * (obstacle.speed || 0), (px - obstacle.x) * (obstacle.speed || 0));
    }
    bounce(ball, x, y, radius, restitution, surfaceX = 0, surfaceY = 0) {
        const dx = ball.x - x, dy = ball.y - y, distance = Math.hypot(dx, dy);
        if (distance >= radius) return;
        const nx = distance > 0.001 ? dx / distance : 0, ny = distance > 0.001 ? dy / distance : -1;
        ball.x = x + nx * radius; ball.y = y + ny * radius;
        const normalSpeed = (ball.vx - surfaceX) * nx + (ball.vy - surfaceY) * ny;
        if (normalSpeed < 0) { ball.vx -= (1 + restitution) * normalSpeed * nx; ball.vy -= (1 + restitution) * normalSpeed * ny; }
        ball.vx = Math.max(-550, Math.min(550, ball.vx)); ball.vy = Math.max(-500, Math.min(650, ball.vy));
    }
    pause() {
        if (this.state.paused || !['recruiting', 'racing'].includes(this.state.phase)) return;
        this.state.paused = true; this.state.pausedAt = this.now(); this.stopTimer(); this.emit();
    }
    resume() {
        if (!this.state.paused) return;
        this.state.recruitUntil += this.now() - this.state.pausedAt; this.state.paused = false; if (this.state.phase === 'racing') this.startTimer(); this.emit();
    }
    action(action, maxPlayers) {
        if (action === 'start') this.start(maxPlayers); else if (action === 'launch') this.launch();
        else if (action === 'pause') this.pause(); else if (action === 'resume') this.resume(); else if (action === 'reset') this.reset();
    }
    destroy() { this.avatars.destroy(); this.stopTimer(); this.entrants.clear(); this.state.balls = []; this.state.results = []; }
}
