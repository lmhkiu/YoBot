export const TRACK = { width: 960, height: 18600, finish: 17860, radius: 12, maxPlayers: 100 };
export const MARBLE_VIEW_HEIGHT = 1000;
export const FORK = { start: 8050, end: 9350 };

export function corridorAt(y) {
    if (y >= 17100 && y < TRACK.finish) {
        const left = y < 17250 ? 66 + (y - 17100) / 150 * 29 : 95 + Math.min(1, (y - 17250) / 500) * 360;
        return { left, right: 960 - left };
    }
    if (y < 250 || y >= TRACK.finish) return { left: 66, right: 894 };
    const entry = Math.min(1, (y - 250) / 550);
    const exit = Math.max(0, Math.min(1, (y - 16500) / 600));
    const center = 480 + Math.sin(y / 810) * 155 * entry * (1 - exit);
    const forkWidth = Math.max(0, Math.min(1, (y - FORK.start + 450) / 450, (FORK.end + 450 - y) / 450));
    const half = (414 + (175 - 414) * entry + 130 * forkWidth) * (1 - exit) + 414 * exit;
    return { left: Math.max(66, center - half), right: Math.min(894, center + half) };
}
export function createTrack() {
    const obstacles = [];
    for (let row = 0; row < 35; row++) {
        const y = 650 + row * 450;
        if (y >= FORK.start - 250 && y < FORK.end) continue;
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
    // Short connected ramps form the divider using the existing collision checks.
    const divider = [[340, 8260], [365, 8460], [395, 8660], [395, 8860], [370, 9060], [340, 9260]];
    for (let i = 1; i < divider.length; i++) {
        const [ax, ay] = divider[i - 1];
        const [bx, by] = divider[i];
        obstacles.push({ type: 'ramp', x: (ax + bx) / 2, y: (ay + by) / 2,
            length: Math.hypot(bx - ax, by - ay), angle: Math.atan2(by - ay, bx - ax) });
    }
    for (const [x, y] of [[168, 8440], [255, 8545], [203, 8650], [295, 8760], [152, 8845], [245, 8925]]) {
        obstacles.push({ type: 'bumper', x, y, radius: 24 });
    }
    for (const [x, y] of [[457, 8490], [545, 8610], [490, 8750], [547, 8890], [452, 9020]]) {
        obstacles.push({ type: 'boost', x, y, radius: 43 });
    }
    // Funnel leaves a 32px opening for 24px marbles, so it feeds one marble across at a time.
    obstacles.push({ type: 'funnel', x: 275, y: 17500, length: Math.hypot(360, 500), angle: Math.atan2(500, 360) });
    obstacles.push({ type: 'funnel', x: 685, y: 17500, length: Math.hypot(360, 500), angle: -Math.atan2(500, 360) });
    obstacles.push({ type: 'ramp', x: 455, y: 17800, length: 100, angle: Math.PI / 2, funnelWall: true });
    obstacles.push({ type: 'ramp', x: 505, y: 17800, length: 100, angle: Math.PI / 2, funnelWall: true });
    return obstacles;
}
