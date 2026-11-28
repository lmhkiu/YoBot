import MarbleScene from './MarbleScene.js';
import { gondolaPose } from '../../ferrisWheel.js';

const ART = 'assets/game/marble/moon-park.webp';
const FONT = '"Malgun Gothic", sans-serif';

export default class MoonMarbleScene extends MarbleScene {
    preload() {
        super.preload();
        this.load.image('moon-park', ART);
        this.load.image('moon-gondola', 'assets/game/marble/moon-gondola.webp');
    }

    drawTrack() {
        for (let index = 0; index <= Math.ceil(this.map.height / 1560); index++) {
            const y = 600 + index * 1560;
            this.add.image(this.map.width / 2, y, 'moon-park').setDisplaySize(this.map.width, 1560);
        }

        const { sideways: { side: east, return: west }, height, corridorAt } = this.map;
        const sample = (from, to, edge, section) => {
            const points = [];
            for (let y = from; y < to; y += 55) points.push({ x: corridorAt(y, section)[edge], y });
            points.push({ x: corridorAt(to, section)[edge], y: to });
            return points;
        };
        const boundary = [
            ...sample(0, east.bottom, 'left', 'entry'),
            ...sample(east.bottom, west.top, 'left', 'exit'),
            ...sample(west.top, height, 'left', 'final'),
            ...sample(west.bottom, height, 'right', 'final').reverse(),
            ...sample(east.top, west.bottom, 'right', 'exit').reverse(),
            ...sample(0, east.top, 'right', 'entry').reverse()
        ];
        const track = this.add.graphics();
        track.fillStyle(0x020811, 0.6).fillPoints(boundary.map(({ x, y }) => ({ x: x + 10, y: y + 12 })), true);
        track.fillStyle(0x172640).fillPoints(boundary, true);
        track.lineStyle(23, 0x4fbed6, 0.16).strokePoints(boundary, false);
        track.lineStyle(12, 0x2b767f, 1).strokePoints(boundary, false);
        track.lineStyle(4, 0xa4f4df, 1).strokePoints(boundary, false);

        const text = (x, y, label, size = 25, color = '#ffdf9a') => this.add.text(x, y, label, {
            fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color,
            stroke: '#0d1829', strokeThickness: 4
        }).setOrigin(0.5);
        text(480, 35, '달빛 놀이공원', 40);
        text(480, 530, '별빛 핀볼 광장');
        text(480, 2380, '회전목마 문');
        text(900, east.top + 48, '중력 전환  →', 28, '#9ff8ef');
        text(1495, east.bottom + 90, '↓  낙하 재개', 24, '#9ff8ef');
        text(1350, 5940, '달빛 급행로');
        text(1195, 6090, '별 범퍼 지름길', 19);
        text(1560, 6090, '가속 우회로', 19, '#9ff8ef');
        text(1020, west.top + 48, '←  중력 전환', 28, '#d4baff');
        text(330, west.bottom + 90, '↓  낙하 재개', 24, '#d4baff');

        this.drawLights(track);
        this.drawPortals(track, text);
        this.drawFerrisWheel(text);
        this.createMoonTextures();
    }

    drawFerrisWheel(text) {
        const wheel = this.map.wheel;
        const { x, y, radius, cabins } = wheel;
        text(x, y - radius - 80, '달빛 대관람차', 31);
        const support = this.add.graphics().setDepth(1);
        const footing = y + radius + 47;
        support.fillStyle(0x010610, 0.45).fillEllipse(x + 8, footing + 10, 292, 37);
        support.fillStyle(0x493149, 0.86).fillRoundedRect(x - 132, footing - 10, 264, 24, 8);
        support.lineStyle(3, 0xc68c64, 0.75).strokeRoundedRect(x - 132, footing - 10, 264, 24, 8);
        for (const direction of [-1, 1]) {
            support.lineStyle(26, 0x452b41, 0.82).beginPath().moveTo(x, y).lineTo(x + direction * 105, footing).strokePath();
            support.lineStyle(11, 0xab725d, 0.82).beginPath().moveTo(x, y).lineTo(x + direction * 105, footing).strokePath();
        }

        const rotor = this.add.graphics().setPosition(x, y).setDepth(2);
        rotor.lineStyle(17, 0xffb35a, 0.13).strokeCircle(0, 0, radius);
        rotor.lineStyle(8, 0x905a58, 1).strokeCircle(0, 0, radius);
        rotor.lineStyle(3, 0xffcf7f, 0.9).strokeCircle(0, 0, radius);
        for (let index = 0; index < cabins; index++) {
            const angle = Math.PI * 2 * index / cabins;
            const endX = Math.cos(angle) * radius;
            const endY = Math.sin(angle) * radius;
            rotor.lineStyle(6, 0xd78c68, 0.76).beginPath().moveTo(0, 0).lineTo(endX, endY).strokePath();
        }
        for (let index = 0; index < cabins * 4; index++) {
            const angle = Math.PI * 2 * index / (cabins * 4);
            const bulbX = Math.cos(angle) * radius;
            const bulbY = Math.sin(angle) * radius;
            rotor.fillStyle(0xffbb68, 0.2).fillCircle(bulbX, bulbY, 7);
            rotor.fillStyle(0xffde9a, 0.94).fillCircle(bulbX, bulbY, 2.7);
        }
        rotor.fillStyle(0x6e4050).fillCircle(0, 0, 24);
        rotor.fillStyle(0xffc478).fillCircle(0, 0, 17);
        rotor.fillStyle(0xffedb2).fillCircle(0, 0, 8);

        this.wheelRotor = rotor;
        this.wheelCabins = Array.from({ length: cabins }, () => ({
            pose: {},
            car: this.add.image(0, 0, 'moon-gondola').setDisplaySize(72, 72).setDepth(3),
            gate: this.add.rectangle(0, 0, 35, 6, 0xeeba70).setDepth(4)
        }));
        this.updateTrackDetails(0);
    }

    updateTrackDetails(elapsed, alpha = 1) {
        const wheel = this.map.wheel;
        const displayTime = Math.max(0, elapsed - (1 - alpha) / 60);
        this.wheelRotor.rotation = displayTime * wheel.speed;
        for (let index = 0; index < this.wheelCabins.length; index++) {
            const { pose, car, gate } = this.wheelCabins[index];
            gondolaPose(wheel, index, displayTime, pose);
            car.setPosition(pose.x, pose.y);
            gate.setPosition(pose.x + (pose.doorOpen ? 20 : 0), pose.y + 18);
            gate.rotation = pose.doorOpen ? Math.PI / 2 : 0;
        }
    }

    drawPortals(track, text) {
        for (const { id, direction, radius, entrance, exit } of this.map.portals) {
            const forward = direction > 0;
            const color = forward ? 0x76efe0 : 0xe391f5;
            const labelColor = forward ? '#abfff0' : '#f3b8ff';
            const { x, y } = entrance;
            track.fillStyle(color, 0.13).fillCircle(x, y, radius + 13);
            track.fillStyle(0x040512, 0.95).fillCircle(x, y, radius);
            track.lineStyle(4, color, 0.95).strokeCircle(x, y, radius);
            track.lineStyle(3, color, 0.55).beginPath().arc(x, y, radius - 10, -0.3, 2.6).strokePath();
            track.lineStyle(2, color, 0.44).beginPath().arc(x, y, radius - 19, 2.5, 5.1).strokePath();
            text(x, y - radius - 15, id + (forward ? ' · 앞으로' : ' · 뒤로'), 18, labelColor);

            track.fillStyle(color, 0.09).fillCircle(exit.x, exit.y, 25);
            track.lineStyle(2, color, 0.65).strokeCircle(exit.x, exit.y, 25);
            track.lineStyle(1, color, 0.32).strokeCircle(exit.x, exit.y, 18);
            text(exit.x, exit.y - 36, id + ' · 출구', 15, labelColor);
        }
    }

    drawLights(track) {
        const { sideways, finish, corridorAt } = this.map;
        for (const { direction, top, bottom } of Object.values(sideways)) {
            const color = direction > 0 ? 0x83efef : 0xc6a6f5;
            for (let x = 710; x < 1310; x += 48) {
                track.fillStyle(color, 0.16).fillCircle(x, top + 20, 10);
                track.fillStyle(color).fillCircle(x, top + 20, 3);
            }
            for (let x = 740; x <= 1290; x += 112) {
                const y = (top + bottom) / 2;
                const tailX = x - 13 * direction;
                track.lineStyle(5, color, 0.35).beginPath().moveTo(tailX, y - 13).lineTo(x, y).lineTo(tailX, y + 13).strokePath();
            }
        }
        const { left, right } = corridorAt(finish, 'final');
        const width = right - left;
        track.fillStyle(0x050a17, 0.65).fillRoundedRect(left + 4, finish - 34, width - 8, 54, 10);
        track.fillStyle(0xa96148).fillRoundedRect(left, finish - 40, width, 28, 9);
        track.lineStyle(3, 0xffdf9a, 1).strokeRoundedRect(left, finish - 40, width, 28, 9);
        for (let index = 0; index < 20; index++) {
            const tile = width / 20;
            const x = left + index * tile;
            track.fillStyle(0xffc96a, 0.28).fillCircle(x + tile / 2, finish - 26, 8);
            track.fillStyle(0xffebb1).fillCircle(x + tile / 2, finish - 26, 3);
            for (let row = 0; row < 2; row++) {
                track.fillStyle((index + row) % 2 ? 0x2a2e48 : 0xffedcb).fillRect(x, finish - 8 + row * 8, tile + 0.5, 8);
            }
        }
    }

    createMoonTextures() {
        const g = this.make.graphics({ add: false });
        if (!this.textures.exists('moon-shadow')) {
            g.fillStyle(0x00030d, 0.14).fillEllipse(20, 9, 40, 18);
            g.fillStyle(0x00030d, 0.22).fillEllipse(20, 9, 32, 13);
            g.fillStyle(0x00030d, 0.34).fillEllipse(20, 9, 24, 9);
            g.generateTexture('moon-shadow', 40, 18).clear();
        }

        if (!this.textures.exists('moon-star')) {
            g.fillStyle(0x050913, 0.55).fillEllipse(34, 50, 54, 19);
            g.fillStyle(0x9c5537).fillCircle(32, 34, 26);
            g.fillStyle(0xe39651).fillCircle(32, 30, 25);
            const points = Array.from({ length: 10 }, (_, i) => {
                const radius = i % 2 ? 12 : 26;
                const angle = i * Math.PI / 5 - Math.PI / 2;
                return { x: 32 + Math.cos(angle) * radius, y: 30 + Math.sin(angle) * radius };
            });
            g.fillStyle(0xffc85a).fillPoints(points, true);
            g.lineStyle(2, 0xfff2ba).strokePoints(points, true);
            g.generateTexture('moon-star', 64, 64).clear();
        }

        if (!this.textures.exists('moon-carousel')) {
            const center = 128;
            g.fillStyle(0x091320, 0.55).fillCircle(center + 4, center + 7, 23);
            for (let arm = 0; arm < 3; arm++) {
                const angle = arm * Math.PI * 2 / 3;
                const x = center + Math.cos(angle) * 113;
                const y = center + Math.sin(angle) * 113;
                const line = (width, color, offset = 0) => g.lineStyle(width, color).beginPath()
                    .moveTo(center, center + offset).lineTo(x, y + offset).strokePath();
                line(24, 0x512d46, 6);
                line(21, 0xe57978);
                g.fillStyle(0xe57978).fillCircle(x, y, 10);
                line(3, 0xffd3a4);
                g.fillStyle(0xffdc98).fillCircle(x, y, 4);
            }
            g.fillStyle(0xaf6542).fillCircle(center, center, 18);
            g.fillStyle(0xffcb72).fillCircle(center, center - 2, 14);
            g.fillStyle(0xffebb1).fillCircle(center - 3, center - 5, 5);
            g.generateTexture('moon-carousel', 256, 256);
        }
        g.destroy();
    }

    createObstacle(obstacle) {
        const { x, y } = obstacle;
        if (obstacle.type === 'carousel') {
            const ring = this.add.graphics();
            ring.lineStyle(4, 0xb98e86, 0.35).strokeCircle(x, y, obstacle.length / 2 + 8);
            ring.lineStyle(2, 0xffce85, 0.32).strokeCircle(x, y, obstacle.length / 2 + 17);
            this.worldLayer.add(ring);
            const diameter = obstacle.length * 256 / 226;
            return this.add.image(x, y, 'moon-carousel').setDisplaySize(diameter, diameter).setRotation(obstacle.angle);
        }
        if (obstacle.star) {
            const size = obstacle.radius * 2.45;
            return this.add.image(x, y, 'moon-star').setDisplaySize(size, size);
        }
        const sprite = super.createObstacle(obstacle);
        if (obstacle.type === 'boost') {
            const side = this.map.sideways[obstacle.section];
            sprite.setTint(side?.direction === -1 ? 0xc6a6f5 : 0x82e8ef);
            if (side) sprite.setRotation(-side.direction * Math.PI / 2);
        } else if (obstacle.type === 'ramp') {
            sprite.setTint(0x99e2d4);
        } else {
            sprite.setTint(0xf9a19c);
        }
        return sprite;
    }

    createBallShadow() {
        return this.add.image(3, 10, 'moon-shadow').setDisplaySize(30, 13);
    }
}
