const east = { section: 'side', from: 'entry', to: 'exit', direction: 1, entryY: 3700, startX: 135, endX: 1360, top: 3500, bottom: 4030 };
const west = { section: 'return', from: 'exit', to: 'final', direction: -1, entryY: 8500, startX: 1710, endX: 550, top: 8280, bottom: 8870 };
const EAST_LENGTH = east.endX - east.startX;
const WEST_LENGTH = west.startX - west.endX;
const HEIGHT = 12920;
const wheel = { x: 345, y: 11780, radius: 167, cabins: 8, speed: 0.94, pullRadius: 62, catchRadius: 23 };
const portals = [
    { id: 'A', direction: 1, radius: 49, entrance: { section: 'entry', x: 535, y: 2390 }, exit: { section: 'entry', x: 460, y: 3450 } },
    { id: 'B', direction: -1, radius: 52, entrance: { section: 'return', x: 1040, y: 8525 }, exit: { section: 'return', x: 1470, y: 8515 } },
    { id: 'C', direction: 1, radius: 47, entrance: { section: 'final', x: 252, y: 10025 }, exit: { section: 'final', x: 331, y: 11225 } },
    { id: 'D', direction: -1, radius: 49, entrance: { section: 'final', x: 392, y: 10965 }, exit: { section: 'final', x: 342, y: 9700 } }
];

function moonCorridorAt(y, section) {
    if (section === 'entry') {
        const taper = Math.max(0, Math.min(1, (y - 240) / 640));
        const center = 480 + Math.sin(y / 550) * 44 * taper;
        const half = 414 - 158 * taper;
        return { left: center - half, right: center + half };
    }
    if (section === 'final') {
        const taper = Math.max(0, Math.min(1, (y - west.bottom) / 650));
        const widen = Math.max(0, 1 - Math.abs(y - wheel.y) / 620);
        const center = (342 + Math.sin((y - west.bottom) / 610) * 65 * taper) * (1 - widen) + wheel.x * widen;
        const half = 227 - 62 * taper + 86 * widen;
        return { left: center - half, right: center + half };
    }
    const expansion = Math.max(0, Math.min(1, (y - 4030) / 850, (9320 - y) / 550));
    const left = 1342 - 290 * expansion + Math.sin((y - 4030) / 460) * 45 * expansion;
    const right = 1710 - 50 * expansion;
    return { left, right };
}

function createMoonTrack() {
    const obstacles = [];
    const add = (section, type, x, y, options) => obstacles.push({ section, type, x, y, ...options });
    for (let row = 0; row < 5; row++) {
        const y = 760 + row * 335;
        const { left, right } = moonCorridorAt(y, 'entry');
        const center = (left + right) / 2;
        for (const offset of (row % 2 ? [-132, 0, 132] : [-188, -63, 63, 188])) {
            add('entry', 'bumper', center + offset, y, { radius: 27, star: true });
        }
    }
    add('entry', 'carousel', 425, 2630, { length: 236, angle: 0, speed: 0.95 });
    add('entry', 'carousel', 521, 3120, { length: 216, angle: Math.PI / 4, speed: -1.04 });
    for (const [x, y] of [[810, 3650], [830, 3910], [965, 3875], [1000, 3580], [1090, 3655], [1205, 3890], [1280, 3570]]) {
        add('side', 'bumper', x, y, { radius: 26, star: true });
    }
    add('side', 'carousel', 1115, 3810, { length: 166, angle: 0.2, speed: 1.1 });
    for (const x of [735, 1015, 1250]) add('side', 'boost', x, 3770, { radius: 45 });
    for (const [x, y] of [[1210, 4720], [1470, 4770], [1170, 4920], [1550, 5100], [1390, 5240], [1250, 5500], [1530, 5540], [1580, 5730]]) {
        add('exit', 'bumper', x, y, { radius: 29 });
    }
    const divider = [[1360, 6080], [1415, 6260], [1450, 6440], [1450, 6620], [1418, 6800], [1367, 6990]];
    for (let i = 1; i < divider.length; i++) {
        const [ax, ay] = divider[i - 1], [bx, by] = divider[i];
        add('exit', 'ramp', (ax + bx) / 2, (ay + by) / 2,
            { length: Math.hypot(bx - ax, by - ay), angle: Math.atan2(by - ay, bx - ax) });
    }
    for (const [x, y] of [[1230, 6270], [1300, 6435], [1170, 6590], [1275, 6780]]) {
        add('exit', 'bumper', x, y, { radius: 26, star: true });
    }
    for (const [x, y] of [[1505, 6190], [1560, 6380], [1545, 6570], [1520, 6750], [1480, 6920]]) {
        add('exit', 'boost', x, y, { radius: 45 });
    }
    add('exit', 'carousel', 1315, 7480, { length: 235, angle: 0.7, speed: 1 });
    add('exit', 'bumper', 1185, 7220, { radius: 30, star: true });
    add('exit', 'bumper', 1550, 7280, { radius: 30, star: true });
    add('exit', 'bumper', 1500, 7980, { radius: 32, star: true });
    add('exit', 'carousel', 1440, 8240, { length: 212, angle: 0.2, speed: -1.05 });
    for (const [x, y] of [[1450, 8715], [1260, 8415], [1080, 8700], [890, 8470], [700, 8725], [665, 8380]]) {
        add('return', 'bumper', x, y, { radius: 31, star: true });
    }
    add('return', 'carousel', 1180, 8565, { length: 196, angle: 0.1, speed: -1.1 });
    add('return', 'carousel', 840, 8735, { length: 166, angle: 1.1, speed: 1.2 });
    for (const x of [1340, 970, 635]) add('return', 'boost', x, 8555, { radius: 36 });
    for (const [x, y] of [[290, 9150], [420, 9285], [240, 9480], [410, 9760], [200, 10010], [380, 10220], [275, 10730], [462, 10930]]) {
        add('final', 'bumper', x, y, { radius: 29, star: true });
    }
    add('final', 'carousel', 320, 10490, { length: 181, angle: -0.3, speed: 1.2 });
    return obstacles;
}

function progressAt({ x, y, section }) {
    if (section === 'side') return east.entryY + Math.max(0, Math.min(EAST_LENGTH, x - east.startX));
    if (section === 'return') return west.entryY + EAST_LENGTH + Math.max(0, Math.min(WEST_LENGTH, west.startX - x));
    if (section === 'exit') return Math.max(east.entryY, Math.min(y, west.entryY)) + EAST_LENGTH;
    if (section === 'final') return Math.max(west.entryY, y) + EAST_LENGTH + WEST_LENGTH;
    return Math.min(y, east.entryY);
}

function positionAt(progress) {
    if (progress >= east.entryY && progress < east.entryY + EAST_LENGTH) {
        return { x: east.startX + progress - east.entryY, y: (east.top + east.bottom) / 2, section: east.section };
    }
    const westStart = west.entryY + EAST_LENGTH;
    if (progress >= westStart && progress < westStart + WEST_LENGTH) {
        return { x: west.startX - (progress - westStart), y: (west.top + west.bottom) / 2, section: west.section };
    }
    const section = progress >= westStart + WEST_LENGTH ? 'final' : progress >= east.entryY + EAST_LENGTH ? 'exit' : 'entry';
    const y = progress - (section === 'entry' ? 0 : EAST_LENGTH) - (section === 'final' ? WEST_LENGTH : 0);
    const { left, right } = moonCorridorAt(y, section);
    return { x: (left + right) / 2, y, section };
}

export const MOON_TRACK = {
    id: 'moon', title: '달빛 놀이공원', width: 1800, height: HEIGHT, finish: 12420, radius: 12,
    sideways: { side: east, return: west }, sidewaysEntries: { entry: east, exit: west },
    sectionTops: { exit: east.top, final: west.top }, progressLength: HEIGHT + EAST_LENGTH + WEST_LENGTH,
    portals, wheel,
    corridorAt: moonCorridorAt, createTrack: createMoonTrack, progressAt, positionAt
};
