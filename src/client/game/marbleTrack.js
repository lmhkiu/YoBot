export const TRACK = { width: 960, height: 18600, finish: 17860, radius: 12, maxPlayers: 100, spiralY: 8600 };
export function corridorAt(y) {
    if (y >= 17100 && y < TRACK.finish) {
        const left = y < 17250 ? 66 + (y - 17100) / 150 * 29 : 95 + Math.min(1, (y - 17250) / 500) * 360;
        return { left, right: 960 - left };
    }
    if (y < 250 || y >= TRACK.finish) return { left: 66, right: 894 };
    const entry = Math.min(1, (y - 250) / 550);
    const exit = Math.max(0, Math.min(1, (y - 16500) / 600));
    const widen = Math.max(0, 1 - Math.abs(y - TRACK.spiralY) / 800);
    const center = 480 + Math.sin(y / 810) * 155 * entry * (1 - exit);
    const half = (414 + (175 - 414) * entry + 210 * widen) * (1 - exit) + 414 * exit;
    return { left: Math.max(66, center - half), right: Math.min(894, center + half) };
}
export function createTrack() {
    const obstacles = [];
    for (let row = 0; row < 35; row++) {
        const y = 650 + row * 450;
        if (Math.abs(y - TRACK.spiralY) < 700) continue;
        const road = corridorAt(y); const center = (road.left + road.right) / 2;
        if (row % 3 === 0) {
            for (let j = -1; j <= 1; j++) obstacles.push({ type: 'bumper', x: center + j * 118, y: y + (j === 0 ? 100 : 0), radius: 25 });
        } else if (row % 3 === 1) {
            obstacles.push({ type: 'spinner', x: center, y, length: 290, angle: row * 0.7, speed: row % 2 ? 0.85 : -0.85 });
        } else {
            obstacles.push({ type: 'ramp', x: center - 65, y, length: 220, angle: 0.28 });
            obstacles.push({ type: 'ramp', x: center + 65, y: y + 125, length: 220, angle: -0.28 });
            obstacles.push({ type: 'boost', x: center, y: y + 250, radius: 35 });
        }
        if ([5,11,23,29].includes(row)) obstacles.push({type:'jump',id:'jump-'+row,x:center+(row%2?70:-70),y:y+290,radius:35});
    }
    const segments = [];
    for (const side of [-1, 1]) for (let i = 0; i < 48; i++) {
        const point = index => {
            const t = index / 48; const angle = -Math.PI / 2 + t * Math.PI * 3;
            const radius = 280 - t * 220 + side * 31;
            return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
        };
        const a = point(i), b = point(i + 1); segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
    obstacles.push({ type: 'spiral', x: 480, y: TRACK.spiralY, speed: 0.28, angle: 0, segments });
    // Funnel leaves a 32px opening for 24px marbles, so it feeds one marble across at a time.
    obstacles.push({ type: 'funnel', x: 275, y: 17500, length: Math.hypot(360, 500), angle: Math.atan2(500, 360) });
    obstacles.push({ type: 'funnel', x: 685, y: 17500, length: Math.hypot(360, 500), angle: -Math.atan2(500, 360) });
    obstacles.push({ type: 'ramp', x: 455, y: 17800, length: 100, angle: Math.PI / 2, funnelWall: true });
    obstacles.push({ type: 'ramp', x: 505, y: 17800, length: 100, angle: Math.PI / 2, funnelWall: true });
    return obstacles;
}
