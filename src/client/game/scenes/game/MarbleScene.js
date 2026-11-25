import { FORK, MARBLE_VIEW_HEIGHT, TRACK, corridorAt } from '../../marbleTrack.js';
import AvatarTextures from '../../AvatarTextures.js';

const colors = [0x7ce3d1, 0xffbd75, 0xc5a3ff, 0xff8fa9, 0x83bfff, 0xf5e87a, 0xbded8e, 0xf5a8ed, 0xb8c5de, 0xffa58a, 0x69d4f1, 0xe2c797];
const font = '"Malgun Gothic", sans-serif';
const VIEW_CENTER_Y = MARBLE_VIEW_HEIGHT / 2;
const MAP_TOP = 100;
const MAP_HEIGHT = MARBLE_VIEW_HEIGHT - 200;

export default class MarbleScene extends Phaser.Scene {
    constructor() { super('MarbleGame'); }
    preload() { this.load.atlas('marble-art', 'assets/game/marble/sprites.png', 'assets/game/marble/sprites.json'); }
    create() {
        this.controller = this.registry.get('controller');
        this.avatarTextures = new AvatarTextures(this);
        this.actors = new Map(); this.obstacleSprites = []; this.mapDots = new Map(); this.cameraMode = 'leader'; this.heldBall = null;
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
        this.cameraLabel = this.add.text(90, 15, '선두 자동 추적', { fontFamily: font, fontSize: '14px', color: '#8be3bf', backgroundColor: '#102032', padding: { x: 10, y: 7 } }).setScrollFactor(0).setDepth(20);
        this.add.image(927, VIEW_CENTER_Y, 'marble-art', 'pixel').setDisplaySize(50, MAP_HEIGHT).setTint(0x09131f).setScrollFactor(0).setDepth(20);
        this.add.text(927, MAP_TOP - 22, 'MAP', { fontFamily: font, fontSize: '12px', color: '#88b2c4' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
        this.mapView = this.add.image(927, MAP_TOP, 'marble-art', 'pixel').setDisplaySize(45, MARBLE_VIEW_HEIGHT / TRACK.height * MAP_HEIGHT).setTint(0xb9e9dc).setAlpha(0.19).setScrollFactor(0).setDepth(21);
        this.add.text(927, MAP_TOP + MAP_HEIGHT + 22, 'GOAL', { fontFamily: font, fontSize: '10px', color: '#8be3bf' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
        this.input.on('pointerdown', pointer => {
            if (pointer.x > 897) { this.navigateMap(pointer); this.mapDragging = true; return; }
            let nearest, distance = 48;
            for (const [key, actor] of this.actors) {
                if (!actor.visible) continue;
                const d = Math.hypot(pointer.worldX - actor.x, pointer.worldY - actor.y);
                if (d < distance) { nearest = key; distance = d; }
            }
            if (nearest) this.heldBall = nearest;
        });
        this.input.on('pointermove', pointer => { if (pointer.isDown && this.mapDragging) this.navigateMap(pointer); });
        const release = () => { this.heldBall = null; this.mapDragging = false; };
        this.input.on('pointerup', release); this.input.on('gameout', release);
        this.cameras.main.setBounds(0, -120, TRACK.width, TRACK.height + 120);
        const cleanup = () => { this.avatarTextures.destroy(); this.actors.clear(); this.mapDots.clear(); this.controller = null; };
        this.events.once('shutdown', cleanup);
        this.events.once('destroy', cleanup);
        this.receive(this.controller.state);
    }
    navigateMap(pointer) {
        this.cameraMode = 'manual';
        this.followedParticipant = null;
        this.manualY = Phaser.Math.Clamp((pointer.y - MAP_TOP) / MAP_HEIGHT, 0, 1) * TRACK.height - VIEW_CENTER_Y;
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
                const sprite = this.add.image(obstacle.x, obstacle.y, 'marble-art', obstacle.type === 'bumper' ? 'bumper' : ['boost','jump'].includes(obstacle.type) ? 'boost' : 'bar');
                if (obstacle.length) sprite.setDisplaySize(obstacle.length, 20).setRotation(obstacle.angle);
                else sprite.setDisplaySize(obstacle.radius * 2, obstacle.radius * 2);
                if(obstacle.type==='jump')sprite.setRotation(Math.PI).setTint(0xffa2d3);
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
                actor = this.add.container(ball.x, ball.y, [image, label]).setDepth(5);
                actor.rollDirection = 1;
                this.actors.set(ball.key, actor);
                this.avatarTextures.get(ball).then(key => {
                    if (key && this.actors.get(ball.key) === actor && image.scene) image.setTexture(key).clearTint().setDisplaySize(28, 28);
                });
                this.mapDots.set(ball.key, this.add.image(927, MAP_TOP, 'marble-art', 'ball').setDisplaySize(6, 6).setTint(colors[ball.color % colors.length]).setScrollFactor(0).setDepth(22));
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
            const previousX = actor.x;
            const previousY = actor.y;
            if (!ball.rank) {
                actor.x = Phaser.Math.Linear(ball.previousX, ball.x, alpha);
                actor.y = Phaser.Math.Linear(ball.previousY, ball.y, alpha);
                if (state.phase === 'racing' && (!firstLive || actor.y > firstLive.y)) firstLive = actor;
            }
            if(ball.rank) {
                actor.exitAt ??= _time;
                const falling = (_time - actor.exitAt) / 1000;
                actor.x=ball.x;actor.y=ball.y+falling*700;actor.setVisible(falling<0.7);
            } else actor.setVisible(true);
            if (!state.paused && actor.visible) {
                const dx = actor.x - previousX;
                const dy = actor.y - previousY;
                const horizontalDistanceSquared = dx * dx;
                const distanceSquared = horizontalDistanceSquared + dy * dy;
                if (distanceSquared > 0) {
                    if (horizontalDistanceSquared * 16 > distanceSquared) actor.rollDirection = Math.sign(dx);
                    const image = actor.list[0];
                    image.rotation += actor.rollDirection * Math.sqrt(distanceSquared) / (image.displayWidth / 2);
                }
            }
            this.mapDots.get(key).setPosition(912 + (ball.x - 66) / 828 * 30, MAP_TOP + Math.min(1, ball.y / TRACK.height) * MAP_HEIGHT).setAlpha(ball.rank?0:1);
        }
        const elapsed = state.elapsed;
        for (const { obstacle, sprite } of this.obstacleSprites) if (obstacle.type === 'spinner') sprite.rotation = obstacle.angle + obstacle.speed * elapsed;
        const leaderY = firstLive?.y ?? (state.phase === 'finished' ? TRACK.finish + 180 : 200);
        const participant = this.actors.get(this.followedParticipant);
        if (this.cameraMode === 'participant' && (state.phase !== 'racing' || !participant || participant.target.rank)) this.followLeader();
        const tracked = this.heldBall && this.actors.get(this.heldBall);
        let target = this.cameraMode === 'manual' ? this.manualY : leaderY - (VIEW_CENTER_Y + 30);
        if (this.cameraMode === 'participant') target = participant.y - VIEW_CENTER_Y;
        if (tracked) target = tracked.y - VIEW_CENTER_Y;
        const camera = this.cameras.main;
        camera.scrollY = Phaser.Math.Linear(camera.scrollY, Phaser.Math.Clamp(target, -120, TRACK.height - MARBLE_VIEW_HEIGHT), Math.min(1, delta / 140));
        this.mapView.y = MAP_TOP + (camera.scrollY + VIEW_CENTER_Y) / TRACK.height * MAP_HEIGHT;
        const label = tracked ? '누르는 동안 추적 · ' + tracked.target.nickname :
            this.cameraMode === 'manual' ? '미니맵 탐색 · 선두 추적으로 복귀' :
            this.cameraMode === 'participant' ? '참가자 추적 · ' + participant.target.nickname :
            state.phase === 'finished' ? '경주 종료 · ' + state.results.length + '명 완주' :
            '선두 자동 추적 · ' + (firstLive?.target.nickname || '출발 대기');
        if (this.cameraLabel.text !== label) this.cameraLabel.setText(label);
        if (!this.hudAt || _time - this.hudAt >= 150) { this.hudAt = _time; this.controller.updateHud(); }
    }
}
