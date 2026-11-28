import MarbleScene from './MarbleScene.js';
import { gondolaPose } from '../../ferrisWheel.js';
import { bakeMoonDeck, RAIL_REPEAT } from './moonDeck.js';

const ART = 'assets/game/marble/moon-park.webp';
const COURSE_ART = 'moon-course';
const FONT = '"Malgun Gothic", sans-serif';

export default class MoonMarbleScene extends MarbleScene {
    preload() {
        super.preload();
        this.load.image('moon-park', ART);
        this.load.image(COURSE_ART, 'assets/game/marble/moon-course.webp');
        this.load.image('moon-gondola', 'assets/game/marble/moon-gondola.webp');
    }

    drawTrack() {
        this.trackDecorations = [];
        for (let index = 0; index <= Math.ceil(this.map.height / 1560); index++) {
            const y = 600 + index * 1560;
            this.addDecoration(this.add.image(this.map.width / 2, y, 'moon-park').setDisplaySize(this.map.width, 1560), y - 780, y + 780);
        }

        const { sideways: { side: east, return: west }, height, corridorAt } = this.map;
        const sample = (from, to, edge, section) => {
            const points = [];
            for (let y = from; y < to; y += RAIL_REPEAT) points.push({ x: corridorAt(y, section)[edge], y });
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
        const atlas = this.textures.get(COURSE_ART).getSourceImage();
        for (const { image, top, bottom } of bakeMoonDeck(this, boundary, atlas, height)) this.addDecoration(image, top, bottom);

        const text = (x, y, label, size = 25, color = '#ffdf9a') => this.addDecoration(this.add.text(x, y, label, {
            fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color,
            stroke: '#0d1829', strokeThickness: 4
        }).setOrigin(0.5), y - size, y + size);
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

        this.drawLights();
        this.drawPortals(text);
        this.drawFerrisWheel(text);
        this.createMoonTextures();
    }

    addDecoration(object, top, bottom) {
        this.trackDecorations.push({ object, top, bottom });
        return object;
    }

    drawFerrisWheel(text) {
        const wheel = this.map.wheel;
        const { x, y, radius, cabins } = wheel;
        text(x, y - radius - 80, '달빛 대관람차', 31);
        this.createWheelTextures(radius, cabins);
        this.wheelDisplayTime = undefined;
        this.wheelSupport = this.add.image(x - 160, y - 16, 'moon-wheel-support').setOrigin(0).setDepth(1);
        this.wheelRotor = this.add.image(x, y, 'moon-wheel-rotor').setDepth(2);
        this.wheelCabins = Array.from({ length: cabins }, () => ({
            pose: {},
            car: this.add.image(0, 0, 'moon-gondola').setDisplaySize(72, 72).setDepth(3),
            gate: this.add.rectangle(0, 0, 35, 6, 0xeeba70).setDepth(4)
        }));
    }

    createWheelTextures(radius, cabins) {
        if (this.textures.exists('moon-wheel-rotor')) return;
        const art = this.make.graphics({ add: false });
        art.translateCanvas(160, 16);
        const footing = radius + 47;
        art.fillStyle(0x010610, 0.45).fillEllipse(8, footing + 10, 292, 37);
        art.fillStyle(0x493149, 0.86).fillRoundedRect(-132, footing - 10, 264, 24, 8);
        art.lineStyle(3, 0xc68c64, 0.75).strokeRoundedRect(-132, footing - 10, 264, 24, 8);
        for (const direction of [-1, 1]) {
            art.lineStyle(26, 0x452b41, 0.82).beginPath().moveTo(0, 0).lineTo(direction * 105, footing).strokePath();
            art.lineStyle(11, 0xab725d, 0.82).beginPath().moveTo(0, 0).lineTo(direction * 105, footing).strokePath();
        }
        art.generateTexture('moon-wheel-support', 320, footing + 46).clear();

        const rotor = art;
        const center = Math.ceil(radius + 10);
        rotor.translateCanvas(center, center);
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

        rotor.generateTexture('moon-wheel-rotor', center * 2, center * 2).destroy();
    }

    updateTrackDetails(elapsed, alpha, viewTop, viewBottom, viewLeft, viewRight) {
        for (const { object, top, bottom } of this.trackDecorations) {
            const visible = bottom >= viewTop && top <= viewBottom;
            if (object.visible !== visible) object.setVisible(visible);
        }
        const wheel = this.map.wheel;
        const wheelVisible = wheel.y + wheel.radius + 96 >= viewTop && wheel.y - wheel.radius - 40 <= viewBottom &&
            wheel.x + wheel.radius + 40 >= viewLeft && wheel.x - wheel.radius - 40 <= viewRight;
        if (this.wheelRotor.visible !== wheelVisible) {
            this.wheelRotor.setVisible(wheelVisible);
            this.wheelSupport.setVisible(wheelVisible);
            for (const { car, gate } of this.wheelCabins) {
                car.setVisible(wheelVisible);
                gate.setVisible(wheelVisible);
            }
        }
        if (!wheelVisible) return;
        const displayTime = Math.max(0, elapsed - (1 - alpha) / 60);
        if (this.wheelDisplayTime === displayTime) return;
        this.wheelDisplayTime = displayTime;
        this.wheelRotor.rotation = displayTime * wheel.speed;
        for (let index = 0; index < this.wheelCabins.length; index++) {
            const { pose, car, gate } = this.wheelCabins[index];
            gondolaPose(wheel, index, displayTime, pose);
            car.setPosition(pose.x, pose.y);
            gate.setPosition(pose.x + (pose.doorOpen ? 20 : 0), pose.y + 18);
            gate.rotation = pose.doorOpen ? Math.PI / 2 : 0;
        }
    }

    drawPortals(text) {
        for (const { id, direction, radius, entrance, exit } of this.map.portals) {
            const forward = direction > 0;
            const color = forward ? 0x76efe0 : 0xe391f5;
            const labelColor = forward ? '#abfff0' : '#f3b8ff';
            const { x, y } = entrance;
            const track = this.addDecoration(this.add.graphics(), y - radius - 14, y + radius + 14);
            track.fillStyle(color, 0.13).fillCircle(x, y, radius + 13);
            track.fillStyle(0x040512, 0.95).fillCircle(x, y, radius);
            track.lineStyle(4, color, 0.95).strokeCircle(x, y, radius);
            track.lineStyle(3, color, 0.55).beginPath().arc(x, y, radius - 10, -0.3, 2.6).strokePath();
            track.lineStyle(2, color, 0.44).beginPath().arc(x, y, radius - 19, 2.5, 5.1).strokePath();
            text(x, y - radius - 15, id + (forward ? ' · 앞으로' : ' · 뒤로'), 18, labelColor);

            const exitMark = this.addDecoration(this.add.graphics(), exit.y - 26, exit.y + 26);
            exitMark.fillStyle(color, 0.09).fillCircle(exit.x, exit.y, 25);
            exitMark.lineStyle(2, color, 0.65).strokeCircle(exit.x, exit.y, 25);
            exitMark.lineStyle(1, color, 0.32).strokeCircle(exit.x, exit.y, 18);
            text(exit.x, exit.y - 36, id + ' · 출구', 15, labelColor);
        }
    }

    drawLights() {
        const { sideways, finish, corridorAt } = this.map;
        for (const { direction, top, bottom } of Object.values(sideways)) {
            const y = (top + bottom) / 2;
            const track = this.addDecoration(this.add.graphics(), y - 16, y + 16);
            for (let x = 740; x <= 1290; x += 112) {
                const tailX = x - 13 * direction;
                track.lineStyle(5, 0x653b28, 0.33).beginPath().moveTo(tailX, y - 13).lineTo(x, y).lineTo(tailX, y + 13).strokePath();
            }
        }
        const { left, right } = corridorAt(finish, 'final');
        const width = right - left;
        const track = this.addDecoration(this.add.graphics(), finish - 42, finish + 20);
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
            g.fillStyle(0x3c1c15, 0.48).fillEllipse(35, 44, 56, 33);
            g.fillStyle(0x6d331c).fillCircle(32, 34, 26);
            g.fillStyle(0xc78940).fillCircle(32, 30, 26);
            g.lineStyle(2, 0xffda8f).strokeCircle(32, 30, 24);
            g.fillStyle(0x894c2a).fillCircle(32, 30, 21);
            const points = Array.from({ length: 10 }, (_, i) => {
                const radius = i % 2 ? 10 : 22;
                const angle = i * Math.PI / 5 - Math.PI / 2;
                return { x: 32 + Math.cos(angle) * radius, y: 30 + Math.sin(angle) * radius };
            });
            const reds = [0xf85453, 0xb51e2e, 0xed414e, 0x941829, 0xc72538, 0x8b1024, 0xc72538, 0xf54a4b, 0xba1c2e, 0xf96d62];
            for (let index = 0; index < points.length; index++) {
                const a = points[index];
                const b = points[(index + 1) % points.length];
                g.fillStyle(reds[index]).fillTriangle(32, 30, a.x, a.y, b.x, b.y);
            }
            g.lineStyle(1.5, 0xffc180).strokePoints(points, true);
            g.generateTexture('moon-star', 64, 64).clear();
        }

        if (!this.textures.exists('moon-boost')) {
            g.fillStyle(0x3c1c15, 0.45).fillEllipse(49, 59, 86, 62);
            g.fillStyle(0x8c4e22).fillCircle(46, 48, 42);
            g.fillStyle(0xd49b49).fillCircle(46, 44, 42);
            g.lineStyle(3, 0xffdc91).strokeCircle(46, 44, 39);
            g.fillStyle(0x0b4d40).fillCircle(46, 44, 35);
            g.lineStyle(2, 0x238b6f).strokeCircle(46, 44, 33);
            for (const y of [31, 47]) {
                g.lineStyle(7, 0x8de2b0).beginPath().moveTo(30, y).lineTo(46, y + 12).lineTo(62, y).strokePath();
            }
            g.generateTexture('moon-boost', 96, 96).clear();
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
            const extent = obstacle.length / 2 + 18;
            const ring = this.addDecoration(this.add.graphics(), y - extent, y + extent);
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
        if (obstacle.type === 'boost') {
            const side = this.map.sideways[obstacle.section];
            const size = obstacle.radius * 2.2;
            return this.add.image(x, y, 'moon-boost').setDisplaySize(size, size).setRotation(side ? -side.direction * Math.PI / 2 : 0);
        }
        const sprite = super.createObstacle(obstacle);
        if (obstacle.type === 'ramp') {
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
