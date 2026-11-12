import { TRACK, corridorAt } from '../../marbleTrack.js';
import AvatarTextures from '../../AvatarTextures.js';

const colors = [0x7ce3d1, 0xffbd75, 0xc5a3ff, 0xff8fa9, 0x83bfff, 0xf5e87a, 0xbded8e, 0xf5a8ed, 0xb8c5de, 0xffa58a, 0x69d4f1, 0xe2c797];
const font = '"Malgun Gothic", sans-serif';

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
            if(Math.abs(y-TRACK.spiralY)<700)continue;
            this.add.text(road.left+15,y,String(i+1).padStart(2,'0')+' / '+['BOUNCE GARDEN','SPIN & SWITCH','WINDING PATH'][i%3],{fontFamily:font,fontSize:'15px',color:'#739bb1'});
        }
        this.add.text(480,TRACK.spiralY-390,'달팽이 회전관',{fontFamily:font,fontSize:'28px',color:'#a1e5d8'}).setOrigin(0.5);
        rail(66,17100,95,17250);rail(894,17100,865,17250);
        this.add.text(480,17000,'FINAL FUNNEL',{fontFamily:font,fontSize:'32px',color:'#b7e6de'}).setOrigin(0.5);
        for(let i=0;i<4;i++)this.add.image(462+i*12,TRACK.finish,'marble-art','pixel').setDisplaySize(12,10).setTint(i%2?0xffffff:0x263347);
        this.add.text(480,18040,'FINISH · 도착 순서가 기록됩니다',{fontFamily:font,fontSize:'23px',color:'#8be3bf'}).setOrigin(0.5);
        this.add.text(480,42,'굴려굴려 · MARBLE RACE',{fontFamily:font,fontSize:'28px',fontStyle:'bold',color:'#e4f4f8'}).setOrigin(0.5);
        this.cameraLabel = this.add.text(90, 15, '선두 자동 추적', { fontFamily: font, fontSize: '14px', color: '#8be3bf', backgroundColor: '#102032', padding: { x: 10, y: 7 } }).setScrollFactor(0).setDepth(20);
        this.add.image(927, 360, 'marble-art', 'pixel').setDisplaySize(50, 540).setTint(0x09131f).setScrollFactor(0).setDepth(20);
        this.add.text(927, 70, 'MAP', { fontFamily: font, fontSize: '12px', color: '#88b2c4' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
        this.mapView = this.add.image(927, 130, 'marble-art', 'pixel').setDisplaySize(45, 60).setTint(0xb9e9dc).setAlpha(0.19).setScrollFactor(0).setDepth(21);
        this.add.text(927, 648, 'GOAL', { fontFamily: font, fontSize: '10px', color: '#8be3bf' }).setOrigin(0.5).setScrollFactor(0).setDepth(20);
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
        this.cameras.main.setBounds(0, -120, 960, TRACK.height + 120);
        const cleanup = () => { this.avatarTextures.destroy(); this.actors.clear(); this.mapDots.clear(); this.controller = null; };
        this.events.once('shutdown', cleanup);
        this.events.once('destroy', cleanup);
        this.receive(this.controller.state);
    }
    navigateMap(pointer) {
        this.cameraMode = 'manual';
        this.manualY = Phaser.Math.Clamp((pointer.y - 100) / 520, 0, 1) * TRACK.height - 360;
    }
    followLeader() { this.cameraMode = 'leader'; this.heldBall = null; }
    receive(state) {
        if (!state || !this.actors) return;
        if (!this.trackDrawn) {
            for (const obstacle of state.obstacles) {
                if (obstacle.type === 'spiral') {
                    const pieces=obstacle.segments.map(({ax,ay,bx,by})=>this.add.image((ax+bx)/2,(ay+by)/2,'marble-art','bar')
                        .setDisplaySize(Math.hypot(bx-ax,by-ay)+2,20).setRotation(Math.atan2(by-ay,bx-ax)));
                    const sprite=this.add.container(obstacle.x,obstacle.y,pieces);
                    this.obstacleSprites.push({obstacle,sprite});continue;
                }
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
                this.actors.set(ball.key, actor);
                this.avatarTextures.get(ball).then(key => {
                    if (key && this.actors.get(ball.key) === actor && image.scene) image.setTexture(key).clearTint().setDisplaySize(28, 28);
                });
                this.mapDots.set(ball.key, this.add.image(927, 100, 'marble-art', 'ball').setDisplaySize(6, 6).setTint(colors[ball.color % colors.length]).setScrollFactor(0).setDepth(22));
            }
            actor.fromX = actor.x; actor.fromY = actor.y; actor.target = ball;
            if(ball.rank && actor.exitAt==null)actor.exitAt=performance.now();
        }
        if (state.phase === 'finished' && this.previousPhase !== 'finished') this.controller.sound('win');
        this.previousPhase = state.phase;
    }
    update(_time, delta) {
        const state = this.controller?.state;
        if (!state || !this.actors) return;
        const alpha = state.paused ? 1 : Phaser.Math.Clamp((performance.now() - this.controller.receivedAt) / 100, 0, 1);
        for (const [key, actor] of this.actors) {
            const ball = actor.target;
            if (!ball.rank) { actor.x = Phaser.Math.Linear(actor.fromX, ball.x, alpha); actor.y = Phaser.Math.Linear(actor.fromY, ball.y, alpha); }
            if(ball.rank) {
                const falling=(performance.now()-actor.exitAt)/1000;
                actor.x=ball.x;actor.y=ball.y+falling*700;actor.setVisible(falling<0.7);
            } else actor.setVisible(true);
            if (!ball.avatarUrl) actor.list[0].rotation=actor.y/28;
            this.mapDots.get(key).setPosition(912+(ball.x-66)/828*30,100+Math.min(1,ball.y/TRACK.height)*520).setAlpha(ball.rank?0:1);
        }
        const elapsed = state.elapsed + (state.phase === 'racing' && !state.paused ? Math.min(0.1, (performance.now() - this.controller.receivedAt) / 1000) : 0);
        for (const { obstacle, sprite } of this.obstacleSprites) if (['spinner','spiral'].includes(obstacle.type)) sprite.rotation = obstacle.angle + obstacle.speed * elapsed;
        const firstLive = state.ranking.find(ball => !ball.rank);
        const tracked = this.heldBall && this.actors.get(this.heldBall);
        let target = this.cameraMode === 'manual' ? this.manualY : (state.results?.length ? TRACK.finish + 180 : firstLive?.y ?? 200) - 390;
        if (tracked) target = tracked.y - 360;
        const camera = this.cameras.main;
        camera.scrollY = Phaser.Math.Linear(camera.scrollY, Phaser.Math.Clamp(target, -120, TRACK.height - 720), Math.min(1, delta / 140));
        this.mapView.y = 100 + (camera.scrollY + 360) / TRACK.height * 520;
        const label = tracked ? '누르는 동안 추적 · ' + tracked.target.nickname : this.cameraMode === 'manual' ? '미니맵 탐색 · 선두 추적으로 복귀' : state.results?.length ? '결승 통과 · ' + state.results.length + '명 완주' : '선두 자동 추적 · ' + (firstLive?.nickname || '출발 대기');
        if (this.cameraLabel.text !== label) this.cameraLabel.setText(label);
        if (!this.hudAt || _time - this.hudAt >= 150) { this.hudAt = _time; this.controller.updateHud(); }
    }
}
