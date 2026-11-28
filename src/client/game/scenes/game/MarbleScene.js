import { FORK, TRACK, corridorAt } from '../../marbleTrack.js';
import AvatarTextures from '../../AvatarTextures.js';

const colors = [0x7ce3d1, 0xffbd75, 0xc5a3ff, 0xff8fa9, 0x83bfff, 0xf5e87a, 0xbded8e, 0xf5a8ed, 0xb8c5de, 0xffa58a, 0x69d4f1, 0xe2c797];
const font = '"Malgun Gothic", sans-serif';
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.8;

export default class MarbleScene extends Phaser.Scene {
    constructor() { super('MarbleGame'); }
    preload() { this.load.atlas('marble-art', 'assets/game/marble/sprites.png', 'assets/game/marble/sprites.json'); }
    create() {
        this.controller = this.registry.get('controller');
        this.avatarTextures = new AvatarTextures(this);
        this.actors = new Map(); this.obstacleSprites = []; this.mapDots = new Map(); this.cameraMode = 'leader'; this.heldBall = null;
        this.map = this.controller.map;
        this.drawTrack();
        this.worldLayer = this.add.layer(this.children.list.slice());
        const camera = this.cameras.main;
        this.overlay = this.cameras.add();
        this.overlay.inputEnabled = false;
        this.overlay.ignore(this.worldLayer);
        this.hudLayer = this.add.layer();
        camera.ignore(this.hudLayer);
        this.cameraLabel = this.add.text(14, 15, '선두 자동 추적', { fontFamily: font, fontSize: '14px', color: '#8be3bf', backgroundColor: '#102032', padding: { x: 10, y: 7 } }).setScrollFactor(0).setDepth(20);
        this.mapBackground = this.add.image(0, 0, 'marble-art', 'pixel').setTint(0x09131f).setScrollFactor(0).setDepth(20);
        this.mapLabel = this.add.text(0, 0, 'MAP', { fontFamily: font, fontSize: '12px', color: '#88b2c4' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
        this.mapView = this.add.image(0, 0, 'marble-art', 'pixel').setTint(0xb9e9dc).setAlpha(0.19).setScrollFactor(0).setDepth(21);
        this.goalLabel = this.add.text(0, 0, 'GOAL', { fontFamily: font, fontSize: '10px', color: '#8be3bf' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
        this.hudLayer.add(this.children.list.filter(child => child !== this.worldLayer && child !== this.hudLayer));
        this.zoomMultiplier = 1;
        this.resizeView(this.scale.gameSize);
        this.scale.on('resize', this.resizeView, this);
        this.input.on('wheel', (_pointer, _objects, _dx, dy) => this.adjustZoom(dy));
        this.input.on('pointerdown', pointer => {
            if (pointer.x >= this.mapX - 24) { this.navigateMap(pointer); this.mapDragging = true; return; }
            const world = camera.getWorldPoint(pointer.x, pointer.y);
            let nearest, distance = 48 / camera.zoom;
            for (const [key, actor] of this.actors) {
                if (!actor.visible) continue;
                const d = Math.hypot(world.x - actor.x, world.y - actor.y);
                if (d < distance) { nearest = key; distance = d; }
            }
            if (nearest) this.heldBall = nearest;
        });
        this.input.on('pointermove', pointer => { if (pointer.isDown && this.mapDragging) this.navigateMap(pointer); });
        const release = () => { this.heldBall = null; this.mapDragging = false; };
        this.input.on('pointerup', release); this.input.on('gameout', release);
        const cleanup = () => {
            this.scale.off('resize', this.resizeView, this);
            this.avatarTextures.destroy();
            this.actors.clear();
            this.mapDots.clear();
            this.controller = null;
        };
        this.events.once('shutdown', cleanup);
        this.events.once('destroy', cleanup);
        this.receive(this.controller.state);
    }
    drawTrack() {
        this.add.image(480, TRACK.height / 2, 'marble-art', 'pixel').setDisplaySize(828, TRACK.height).setTint(0x101e2d);
        const rail = (ax, ay, bx, by, thickness = 6) => this.add.image((ax+bx)/2, (ay+by)/2, 'marble-art', 'bar')
            .setDisplaySize(Math.hypot(bx-ax, by-ay)+2, thickness).setRotation(Math.atan2(by-ay, bx-ax));
        for (let y = 250; y < 17100; y += 80) {
            const a = corridorAt(y), b = corridorAt(Math.min(17100, y+80));
            rail(a.left,y,b.left,y+80);rail(a.right,y,b.right,y+80);
        }
        for (let i = 0; i < 35; i++) {
            const y=440+i*450, road=corridorAt(y);
            if (y >= FORK.start && y <= FORK.end) continue;
            this.add.text(road.left+15,y,String(i+1).padStart(2,'0')+' / '+['BOUNCE GARDEN','SPIN & SWITCH','WINDING PATH'][i%3],{fontFamily:font,fontSize:'15px',color:'#739bb1'});
        }
        this.add.text(340, FORK.start + 30, '역전 갈림길', { fontFamily: font, fontSize: '26px', color: '#e4f4f8' }).setOrigin(0.5);
        this.add.text(202, FORK.start + 160, '범퍼 지름길', { fontFamily: font, fontSize: '18px', color: '#ffbd75' }).setOrigin(0.5);
        this.add.text(483, FORK.start + 160, '가속 우회로', { fontFamily: font, fontSize: '18px', color: '#7ce3d1' }).setOrigin(0.5);
        rail(66,17100,95,17250);rail(894,17100,865,17250);
        this.add.text(480,17000,'FINAL FUNNEL',{fontFamily:font,fontSize:'32px',color:'#b7e6de'}).setOrigin(0.5);
        for(let i=0;i<4;i++)this.add.image(462+i*12,TRACK.finish,'marble-art','pixel').setDisplaySize(12,10).setTint(i%2?0xffffff:0x263347);
        this.add.text(480,18040,'FINISH · 도착 순서가 기록됩니다',{fontFamily:font,fontSize:'23px',color:'#8be3bf'}).setOrigin(0.5);
        this.add.text(480,42,'굴려굴려 · MARBLE RACE',{fontFamily:font,fontSize:'28px',fontStyle:'bold',color:'#e4f4f8'}).setOrigin(0.5);
    }
    createObstacle(obstacle) {
        const sprite = this.add.image(obstacle.x, obstacle.y, 'marble-art', obstacle.type === 'bumper' ? 'bumper' : ['boost','jump'].includes(obstacle.type) ? 'boost' : 'bar');
        if (obstacle.length) sprite.setDisplaySize(obstacle.length, 20).setRotation(obstacle.angle);
        else sprite.setDisplaySize(obstacle.radius * 2, obstacle.radius * 2);
        if(obstacle.type==='jump')sprite.setRotation(Math.PI).setTint(0xffa2d3);
        return sprite;
    }
    createBallShadow() { return null; }
    updateTrackDetails(_elapsed, _alpha) {}
    resizeView({ width, height }) {
        if (width <= 0 || height <= 0) return;
        const camera = this.cameras.main;
        camera.scrollX += ((this.viewWidth ?? TRACK.width) - width) / 2;
        camera.scrollY += ((this.viewHeight ?? height) - height) / 2;
        this.viewWidth = width;
        this.viewHeight = height;
        camera.setSize(width, height);
        this.overlay.setSize(width, height);
        camera.setZoom(width / TRACK.width * this.zoomMultiplier);
        this.mapX = width - 32;
        this.mapTop = Math.min(84, height * 0.16);
        this.mapHeight = height - 2 * this.mapTop;
        this.mapBackground.setPosition(this.mapX, height / 2).setDisplaySize(44, this.mapHeight);
        this.mapLabel.setPosition(this.mapX, this.mapTop - 15);
        this.goalLabel.setPosition(this.mapX, this.mapTop + this.mapHeight + 15);
        this.mapView.x = this.mapX;
        this.mapView.displayWidth = 40;
    }
    adjustZoom(deltaY) {
        if (!deltaY) return;
        this.zoomMultiplier = Phaser.Math.Clamp(this.zoomMultiplier * (deltaY < 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM);
        this.cameras.main.setZoom(this.viewWidth / TRACK.width * this.zoomMultiplier);
    }
    navigateMap(pointer) {
        this.cameraMode = 'manual';
        this.followedParticipant = null;
        this.manualProgress = Phaser.Math.Clamp((pointer.y - this.mapTop) / this.mapHeight, 0, 1) * this.map.progressLength;
    }
    followLeader() { this.cameraMode = 'leader'; this.heldBall = null; this.followedParticipant = null; }
    followParticipant(key) {
        const actor = this.actors.get(key);
        if (this.controller.state?.phase !== 'racing' || !actor || actor.target.rank) return;
        this.cameraMode = 'participant';
        this.heldBall = null;
        this.followedParticipant = key;
    }
    receive(state) {
        if (!state || !this.actors) return;
        if (!this.trackDrawn) {
            for (const obstacle of state.obstacles) {
                const sprite = this.createObstacle(obstacle);
                this.worldLayer.add(sprite);
                this.obstacleSprites.push({ obstacle, sprite });
            }
            this.trackDrawn = true;
        }
        const wanted = new Set(state.balls.map(ball => ball.key));
        for (const [key, actor] of this.actors) if (!wanted.has(key)) { actor.destroy(); this.actors.delete(key); this.mapDots.get(key)?.destroy(); this.mapDots.delete(key); }
        if (state.phase === 'recruiting' && this.previousPhase !== state.phase) {
            this.followLeader(); this.avatarTextures.destroy(); this.avatarTextures = new AvatarTextures(this);
        }
        for (const ball of state.balls) {
            let actor = this.actors.get(ball.key);
            if (!actor) {
                const image = this.add.image(0, 0, 'marble-art', 'ball').setDisplaySize(24, 24).setTint(colors[ball.color % colors.length]);
                const label = this.add.text(0, -24, Array.from(ball.nickname).slice(0, 12).join(''), { fontFamily: font, fontSize: '16px', color: '#eaf4fa', stroke: '#102032', strokeThickness: 4 }).setOrigin(0.5);
                const shadow = this.createBallShadow();
                actor = this.add.container(ball.x, ball.y, shadow ? [shadow, image, label] : [image, label]).setDepth(5);
                actor.marbleImage = image;
                this.worldLayer.add(actor);
                actor.rollDirection = 1;
                this.actors.set(ball.key, actor);
                this.avatarTextures.get(ball).then(key => {
                    if (key && this.actors.get(ball.key) === actor && image.scene) image.setTexture(key).clearTint().setDisplaySize(28, 28);
                });
                const mapDot = this.add.image(this.mapX, this.mapTop, 'marble-art', 'ball').setDisplaySize(6, 6).setTint(colors[ball.color % colors.length]).setScrollFactor(0).setDepth(22);
                this.hudLayer.add(mapDot);
                this.mapDots.set(ball.key, mapDot);
            }
            actor.target = ball;
        }
        this.previousPhase = state.phase;
    }
    update(_time, delta) {
        const state = this.controller?.state;
        if (!state || !this.actors) return;
        const alpha = this.controller.advanceRace(delta);
        let firstLive;
        for (const [key, actor] of this.actors) {
            const ball = actor.target;
            actor.warped = actor.lastPortal !== ball.lastPortal;
            if (actor.warped) {
                actor.lastPortal = ball.lastPortal;
                actor.portalNoticeUntil = _time + 1400;
            }
            const previousX = actor.x;
            const previousY = actor.y;
            if (!ball.rank) {
                actor.x = Phaser.Math.Linear(ball.previousX, ball.x, alpha);
                actor.y = Phaser.Math.Linear(ball.previousY, ball.y, alpha);
                if (state.phase === 'racing' && (!firstLive || ball.progress > firstLive.target.progress)) firstLive = actor;
            }
            if(ball.rank) {
                actor.exitAt ??= _time;
                const falling = (_time - actor.exitAt) / 1000;
                actor.x=ball.x;actor.y=ball.y+falling*700;actor.setVisible(falling<0.7);
            } else actor.setVisible(true);
            if (!state.paused && actor.visible && !actor.warped) {
                const dx = actor.x - previousX;
                const dy = actor.y - previousY;
                const horizontalDistanceSquared = dx * dx;
                const distanceSquared = horizontalDistanceSquared + dy * dy;
                if (distanceSquared > 0) {
                    if (horizontalDistanceSquared * 16 > distanceSquared) actor.rollDirection = Math.sign(dx);
                    const image = actor.marbleImage;
                    image.rotation += actor.rollDirection * Math.sqrt(distanceSquared) / (image.displayWidth / 2);
                }
            }
            this.mapDots.get(key).setPosition(this.mapX - 15 + ball.x / this.map.width * 30,
                this.mapTop + Phaser.Math.Clamp(ball.progress / this.map.progressLength, 0, 1) * this.mapHeight).setAlpha(ball.rank ? 0 : 1);
        }
        const elapsed = state.elapsed;
        for (const { obstacle, sprite } of this.obstacleSprites) if (obstacle.type === 'spinner' || obstacle.type === 'carousel') sprite.rotation = obstacle.angle + obstacle.speed * elapsed;
        this.updateTrackDetails(elapsed, alpha);
        const participant = this.actors.get(this.followedParticipant);
        if (this.cameraMode === 'participant' && (state.phase !== 'racing' || !participant || participant.target.rank)) this.followLeader();
        const tracked = this.heldBall && this.actors.get(this.heldBall);
        const camera = this.cameras.main;
        const focus = tracked || (this.cameraMode === 'participant' ? participant : null);
        const follow = focus || (this.cameraMode === 'leader' ? firstLive : null);
        const progress = follow?.target.progress ?? (this.cameraMode === 'manual' ? this.manualProgress :
            state.phase === 'finished' ? this.map.progressLength - (this.map.height - this.map.finish) + 180 : 200);
        const target = follow ?? this.map.positionAt(progress);
        const side = this.map.sideways?.[follow?.target.section ?? target.section];
        const wideMoonView = this.map.sideways && this.zoomMultiplier <= 1 && !focus && !side;
        const targetX = wideMoonView ? this.map.positionAt(progress).x : target.x;
        const targetY = target.y - (focus || this.cameraMode === 'manual' ? 0 : 30 / camera.zoom);
        const centerX = this.viewWidth / 2;
        const centerY = this.viewHeight / 2;
        const visibleHalfWidth = centerX / camera.zoom;
        const visibleHalfHeight = centerY / camera.zoom;
        const horizontalLimit = Math.max(0, this.map.width / 2 - visibleHalfWidth);
        const blend = follow?.warped ? 1 : Math.min(1, delta / 140);
        camera.scrollX = Phaser.Math.Linear(camera.scrollX,
            this.map.width / 2 - centerX + Phaser.Math.Clamp(targetX - this.map.width / 2, -horizontalLimit, horizontalLimit), blend);
        camera.scrollY = Phaser.Math.Linear(camera.scrollY,
            Phaser.Math.Clamp(targetY, -120 + visibleHalfHeight, this.map.height - visibleHalfHeight) - centerY, blend);
        const mapProgress = this.map.id === 'marble' ? camera.scrollY + centerY : progress;
        this.mapView.y = this.mapTop + Phaser.Math.Clamp(mapProgress / this.map.progressLength, 0, 1) * this.mapHeight;
        const mapWindowHeight = 2 * (side ? visibleHalfWidth : visibleHalfHeight) / this.map.progressLength * this.mapHeight;
        if (this.mapView.displayHeight !== mapWindowHeight) this.mapView.displayHeight = mapWindowHeight;
        const label = tracked ? '누르는 동안 추적 · ' + tracked.target.nickname :
            this.cameraMode === 'manual' ? '미니맵 탐색 · 선두 추적으로 복귀' :
            this.cameraMode === 'participant' ? '참가자 추적 · ' + participant.target.nickname :
            state.phase === 'finished' ? '경주 종료 · ' + state.results.length + '명 완주' :
            '선두 자동 추적 · ' + (firstLive?.target.nickname || '출발 대기');
        const gravity = side ? (side.direction > 0 ? '  ·  중력 →' : '  ·  중력 ←') : '';
        const portal = follow?.portalNoticeUntil > _time ? follow.lastPortal : null;
        const notice = portal ? '  ·  블랙홀 ' + portal.id + (portal.direction > 0 ? ' 앞으로' : ' 뒤로') : '';
        const ride = follow?.target.gondola !== undefined ? '  ·  대관람차 탑승' : '';
        const caption = label + gravity + notice + ride;
        if (this.cameraLabel.text !== caption) this.cameraLabel.setText(caption);
        if (!this.hudAt || _time - this.hudAt >= 150) { this.hudAt = _time; this.controller.updateHud(); }
    }
}
