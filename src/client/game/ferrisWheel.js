const TURN = Math.PI * 2;
const BOTTOM = Math.PI / 2;
const OPENING_CYCLE = 2 * TURN;
const OPENING_WINDOW = 0.22;

export function gondolaPose(wheel, index, elapsed, pose) {
    const startAngle = index * TURN / wheel.cabins;
    const travel = elapsed * wheel.speed;
    const angle = startAngle + travel;
    pose.x = wheel.x + Math.cos(angle) * wheel.radius;
    pose.y = wheel.y + Math.sin(angle) * wheel.radius;
    const firstBottom = (BOTTOM - startAngle + TURN) % TURN;
    const sinceOpening = travel - firstBottom - (index % 2) * TURN;
    pose.pastOpening = sinceOpening - Math.floor(sinceOpening / OPENING_CYCLE) * OPENING_CYCLE;
    pose.doorOpen = pose.pastOpening < OPENING_WINDOW || pose.pastOpening > OPENING_CYCLE - OPENING_WINDOW;
}
