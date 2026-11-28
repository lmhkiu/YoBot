const CHUNK_HEIGHT = 512;
const RAIL_PADDING = 64;
const SCALE = 0.5;
const WOOD_WIDTH = 512;
const WOOD_HEIGHT = 256;
const WOOD_STEP_X = WOOD_WIDTH - 1;
const WOOD_STEP_Y = WOOD_HEIGHT - 1;
export const RAIL_REPEAT = 82;

export function bakeMoonDeck(scene, boundary, atlas, height) {
    const path = new Path2D();
    path.moveTo(boundary[0].x, boundary[0].y);
    const edges = [];
    for (let index = 1; index < boundary.length; index++) {
        const start = boundary[index - 1];
        const end = boundary[index];
        path.lineTo(end.x, end.y);
        if (start.x !== end.x || start.y !== end.y) edges.push({ start, end });
    }
    const outline = new Path2D(path);
    outline.closePath();
    const chunks = [];
    for (let top = -RAIL_PADDING; top < height + RAIL_PADDING; top += CHUNK_HEIGHT) {
        // Overlap one texture pixel so fractional camera zoom cannot open a seam.
        const bottom = Math.min(top + CHUNK_HEIGHT + 2, height + RAIL_PADDING);
        const nearbyEdges = edges.filter(({ start, end }) =>
            Math.max(start.y, end.y) >= top - RAIL_PADDING && Math.min(start.y, end.y) <= bottom + RAIL_PADDING);
        if (!nearbyEdges.length) continue;
        let left = Infinity;
        let right = -Infinity;
        for (const { start, end } of nearbyEdges) {
            left = Math.min(left, start.x, end.x);
            right = Math.max(right, start.x, end.x);
        }
        left = Math.floor((left - RAIL_PADDING) * SCALE) / SCALE;
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil((right + RAIL_PADDING - left) * SCALE);
        canvas.height = (bottom - top) * SCALE;
        const context = canvas.getContext('2d');
        context.setTransform(SCALE, 0, 0, SCALE, -left * SCALE, -top * SCALE);
        context.save();
        context.translate(10, 12);
        context.fillStyle = 'rgba(36, 17, 21, 0.58)';
        context.fill(outline);
        context.restore();
        context.save();
        context.clip(outline);
        for (let row = Math.max(0, Math.floor((top - 1) / WOOD_STEP_Y)); row * WOOD_STEP_Y < bottom; row++) {
            for (let column = Math.max(0, Math.floor((left - 1) / WOOD_STEP_X)); column * WOOD_STEP_X < right; column++) {
                const flipX = column % 2;
                const flipY = row % 2;
                context.save();
                context.translate(column * WOOD_STEP_X + flipX * WOOD_WIDTH, row * WOOD_STEP_Y + flipY * WOOD_HEIGHT);
                context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
                context.drawImage(atlas, 0, 0, WOOD_WIDTH, WOOD_HEIGHT, 0, 0, WOOD_WIDTH, WOOD_HEIGHT);
                context.restore();
            }
        }
        context.restore();
        context.strokeStyle = '#613521';
        context.lineWidth = 15;
        context.lineJoin = 'round';
        context.stroke(path);
        for (const { start, end } of nearbyEdges) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.hypot(dx, dy);
            const repeats = Math.max(1, Math.round(length / RAIL_REPEAT));
            const width = length / repeats + 1;
            const angle = Math.atan2(-dy, -dx);
            for (let repeat = 0; repeat < repeats; repeat++) {
                const fraction = (repeat + 0.5) / repeats;
                context.save();
                context.translate(start.x + dx * fraction, start.y + dy * fraction);
                context.rotate(angle);
                context.drawImage(atlas, 0, 260, 88, 80, -width / 2, -59 * 0.22, width, 59);
                context.restore();
            }
        }
        const key = `moon-deck-${chunks.length}`;
        scene.textures.addCanvas(key, canvas);
        const image = scene.add.image(left, top, key).setOrigin(0).setScale(1 / SCALE);
        chunks.push({ key, image, top, bottom });
    }
    scene.events.once('shutdown', () => {
        for (const { key } of chunks) scene.textures.remove(key);
    });
    return chunks;
}
