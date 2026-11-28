const TURN = Math.PI * 2;
const BOTTOM = Math.PI / 2;

export function gondolaPose(wheel, index, elapsed, pose) {
    const angle = index * TURN / wheel.cabins + elapsed * wheel.speed;
    pose.x = wheel.x + Math.cos(angle) * wheel.radius;
    pose.y = wheel.y + Math.sin(angle) * wheel.radius;
    pose.pastBottom = ((angle - BOTTOM) % TURN + TURN) % TURN;
    pose.doorOpen = pose.pastBottom < 0.22 || pose.pastBottom > TURN - 0.22;
}
