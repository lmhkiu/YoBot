import { getMarbleTrack } from './marbleTrack.js';
import { gondolaPose } from './ferrisWheel.js';

const STEP = 1 / 60;

export default class MarblePhysics {
    constructor(roster, obstacles, random = Math.random, map = getMarbleTrack()) {
        this.obstacles = obstacles;
        this.map = map;
        this.gondolas = map.wheel ? Array.from({ length: map.wheel.cabins }, () => ({})) : null;
        this.random = random;
        this.accumulator = 0;
        const people = [...roster];
        for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [people[i], people[j]] = [people[j], people[i]]; }
        const columns = Array.from({ length: 20 }, (_, index) => index);
        const balls = people.map((person, i) => {
            // Sample empty columns without replacement in each row.
            const columnIndex = i % columns.length;
            const choice = columnIndex + Math.floor(this.random() * (columns.length - columnIndex));
            [columns[columnIndex], columns[choice]] = [columns[choice], columns[columnIndex]];
            const x = 100 + columns[columnIndex] * 40 + (this.random() - 0.5) * 12;
            const y = 210 - Math.floor(i / columns.length) * 40 + (this.random() - 0.5) * 10;
            return { ...person, x, y, vx: (this.random() - 0.5) * 140, vy: 0, section: 'entry',
                color: i % 12, rank: null, time: null, progress: y, progressAt: 0, furthestProgress: 0 };
        });
        for (const ball of balls) {
            ball.previousX = ball.x;
            ball.previousY = ball.y;
        }
        this.state = { phase: 'racing', elapsed: 0, balls, results: [], timedOut: false };
    }

    advance(delta) {
        this.accumulator += Math.min(0.25, Math.max(0, delta / 1000));
        while (this.accumulator >= STEP && this.state.phase === 'racing') {
            for (const ball of this.state.balls) {
                ball.previousX = ball.x;
                ball.previousY = ball.y;
            }
            this.step(STEP);
            this.accumulator -= STEP;
        }
        return this.state.phase === 'finished' ? 1 : this.accumulator / STEP;
    }

    step(dt) {
        if (this.state.phase !== 'racing') return;
        this.state.elapsed += dt;
        const live = this.state.balls.filter(ball => !ball.rank);
        const { radius: r, finish, sideways, sidewaysEntries, sectionTops, corridorAt, progressAt, portals, wheel } = this.map;
        if (wheel) {
            for (let index = 0; index < this.gondolas.length; index++) gondolaPose(wheel, index, this.state.elapsed, this.gondolas[index]);
        }
        for (const ball of live) {
            if (ball.gondola !== undefined) {
                const cabin = this.gondolas[ball.gondola];
                ball.x = cabin.x;
                ball.y = cabin.y;
                if (cabin.pastOpening < wheel.speed * dt) {
                    cabin.ball = null;
                    ball.gondola = undefined;
                    ball.y += 28;
                    ball.vx = 0;
                    ball.vy = 255;
                    ball.progressAt = this.state.elapsed;
                }
                continue;
            }
            let side = sideways?.[ball.section];
            if (side) {
                ball.vx = side.direction * Math.min(600, side.direction * ball.vx + 440 * dt);
                ball.vy *= 0.991;
            } else {
                ball.vy = Math.min(530, ball.vy + 310 * dt);
                ball.vx *= 0.999;
            }
            ball.x += ball.vx * dt; ball.y += ball.vy * dt;
            const entry = sidewaysEntries?.[ball.section];
            if (entry && ball.y >= entry.entryY) {
                side = entry;
                ball.section = side.section;
                ball.vx = side.direction * Math.max(75, side.direction * ball.vx);
                ball.vy *= 0.45;
            }
            if (side) {
                const road = corridorAt(ball.y, side.from);
                const rearWall = side.direction > 0 ? Math.max(side.startX, road.left) + r : Math.min(side.startX, road.right) - r;
                if (side.direction * (ball.x - rearWall) < 0) {
                    ball.x = rearWall;
                    ball.vx = side.direction * Math.abs(ball.vx) * 0.5;
                }
                if (ball.y < side.top + r) { ball.y = side.top + r; ball.vy = Math.abs(ball.vy) * 0.6; }
                if (ball.y > side.bottom - r) { ball.y = side.bottom - r; ball.vy = -Math.abs(ball.vy) * 0.6; }
                if (side.direction * (ball.x - side.endX) >= 0) {
                    ball.section = side.to;
                    ball.vx *= 0.34;
                    ball.vy = Math.max(120, ball.vy);
                    side = undefined;
                }
            }
            if (!side) {
                const road = corridorAt(ball.y, ball.section);
                const before = corridorAt(ball.y - 1, ball.section), after = corridorAt(ball.y + 1, ball.section);
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
                const top = sectionTops?.[ball.section];
                if (top !== undefined && ball.y < top + r) {
                    ball.y = top + r;
                    ball.vy = Math.abs(ball.vy) * 0.6;
                }
            }
            for (const obstacle of this.obstacles) {
                if (obstacle.type === 'funnel' || obstacle.funnelWall) continue;
                if (obstacle.section && obstacle.section !== ball.section) continue;
                if (Math.abs(ball.y - obstacle.y) > 170) continue;
                if (obstacle.type === 'jump') {
                    if (ball.vy > 0 && Math.hypot(ball.x-obstacle.x,ball.y-obstacle.y)<obstacle.radius && !(ball.jumped||[]).includes(obstacle.id)) {
                        (ball.jumped??=[]).push(obstacle.id);ball.vy=-560;ball.vx+=(this.random()-0.5)*160;ball.lastJumpAt=this.state.elapsed;
                    }
                } else if (obstacle.type === 'boost') {
                    if (Math.hypot(ball.x - obstacle.x, ball.y - obstacle.y) < obstacle.radius) {
                        if (side) ball.vx = side.direction * Math.min(700, side.direction * ball.vx + 1500 * dt);
                        else {
                            ball.vy = Math.min(650, ball.vy + 1150 * dt);
                            ball.vx += (obstacle.x < (sideways ? 1445 : 480) ? 1 : -1) * 170 * dt;
                        }
                    }
                } else if (obstacle.type === 'bumper') this.bounce(ball, obstacle.x, obstacle.y, obstacle.radius + r, 1.03);
                else if (obstacle.type === 'carousel') {
                    for (let arm = 0; arm < 3; arm++) {
                        const angle = obstacle.angle + obstacle.speed * this.state.elapsed + arm * Math.PI * 2 / 3;
                        this.collideSegment(ball, obstacle.x, obstacle.y,
                            obstacle.x + Math.cos(angle) * obstacle.length / 2, obstacle.y + Math.sin(angle) * obstacle.length / 2, obstacle);
                    }
                }
                else {
                    const angle = obstacle.angle + (obstacle.speed || 0) * this.state.elapsed;
                    const dx = Math.cos(angle) * obstacle.length / 2, dy = Math.sin(angle) * obstacle.length / 2;
                    this.collideSegment(ball, obstacle.x - dx, obstacle.y - dy, obstacle.x + dx, obstacle.y + dy, obstacle);
                }
            }
            if (portals && this.teleport(ball, portals)) continue;
            if (wheel && ball.section === 'final' && !ball.wheelVisited &&
                Math.abs(ball.y - wheel.y) <= wheel.radius + wheel.pullRadius &&
                Math.abs(ball.x - wheel.x) <= wheel.radius + wheel.pullRadius) {
                this.pullIntoGondola(ball, wheel, dt);
                if (ball.gondola !== undefined) continue;
            }
            // A resting marble gets a small lateral nudge, without changing its progress.
            const progress = progressAt(ball);
            if (progress > ball.furthestProgress + 35) { ball.furthestProgress = progress; ball.progressAt = this.state.elapsed; }
            if (this.state.elapsed - ball.progressAt > 4) {
                if (side) ball.vy += (this.random() - 0.5) * 180;
                else ball.vx += (this.random() - 0.5) * 180;
                ball.progressAt = this.state.elapsed;
            }
        }
        // Broad phase grid bounds pair checks for large viewer groups.
        const grid = new Map();
        for (const ball of live) {
            if (ball.gondola !== undefined) continue;
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
        for (const ball of live) ball.progress = progressAt(ball);
        const crossed = live.filter(ball => ball.y >= finish).sort((a, b) =>
            (a.y - finish) / Math.max(1, a.vy) - (b.y - finish) / Math.max(1, b.vy)).reverse();
        for (const ball of crossed) {
            ball.rank = this.state.results.length + 1;
            ball.time = this.state.elapsed - Math.min(dt, Math.max(0, (ball.y - finish) / Math.max(1, ball.vy)));
            this.state.results.push({ key: ball.key, nickname: ball.nickname, platform: ball.platform, rank: ball.rank, time: ball.time });
        }
        if (this.state.results.length === this.state.balls.length || this.state.elapsed >= 360) {
            this.state.phase = 'finished'; this.state.timedOut = this.state.results.length < this.state.balls.length;
        }
    }
    pullIntoGondola(ball, wheel, dt) {
        let nearest;
        let distanceSquared = wheel.pullRadius * wheel.pullRadius;
        for (let index = 0; index < this.gondolas.length; index++) {
            const cabin = this.gondolas[index];
            if (cabin.ball || cabin.doorOpen) continue;
            const dx = cabin.x - ball.x;
            const dy = cabin.y - ball.y;
            const squared = dx * dx + dy * dy;
            if (squared < distanceSquared) { nearest = index; distanceSquared = squared; }
        }
        if (nearest === undefined) return;
        const cabin = this.gondolas[nearest];
        if (distanceSquared <= wheel.catchRadius * wheel.catchRadius) {
            cabin.ball = ball;
            ball.gondola = nearest;
            ball.wheelVisited = true;
            ball.x = cabin.x;
            ball.y = cabin.y;
            ball.vx = 0;
            ball.vy = 0;
            return;
        }
        const distance = Math.sqrt(distanceSquared);
        const pull = 1800 * (1 - distance / wheel.pullRadius) * dt / distance;
        ball.vx += (cabin.x - ball.x) * pull;
        ball.vy += (cabin.y - ball.y) * pull;
    }
    teleport(ball, portals) {
        for (const portal of portals) {
            const { entrance, exit, id, radius } = portal;
            if (ball.section !== entrance.section || ball.usedPortals?.has(id)) continue;
            const dx = ball.x - entrance.x;
            const dy = ball.y - entrance.y;
            const reach = radius + this.map.radius;
            if (dx * dx + dy * dy > reach * reach) continue;

            (ball.usedPortals ??= new Set()).add(id);
            ball.lastPortal = portal;
            ball.section = exit.section;
            ball.x = ball.previousX = exit.x;
            ball.y = ball.previousY = exit.y;
            const side = this.map.sideways?.[ball.section];
            ball.vx = side ? side.direction * 210 : 0;
            ball.vy = side ? 0 : 220;
            ball.furthestProgress = this.map.progressAt(ball);
            ball.progressAt = this.state.elapsed;
            return true;
        }
        return false;
    }
    collideSegment(ball, ax, ay, bx, by, obstacle) {
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((ball.x - ax) * dx + (ball.y - ay) * dy) / (dx * dx + dy * dy)));
        const px = ax + t * dx, py = ay + t * dy;
        this.bounce(ball, px, py, this.map.radius + 10, 0.65, -(py - obstacle.y) * (obstacle.speed || 0), (px - obstacle.x) * (obstacle.speed || 0));
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
}
