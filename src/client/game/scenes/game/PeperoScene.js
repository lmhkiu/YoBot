const lanes = [270, 400, 530];
const font = '"Malgun Gothic", sans-serif';

export default class PeperoScene extends Phaser.Scene {
    constructor() { super('PeperoGame'); }

    preload() {
        this.load.image('pepero-arena', 'assets/game/pepero/arena.png');
        this.load.spritesheet('pepero-characters', 'assets/game/pepero/characters.png', { frameWidth: 627, frameHeight: 627 });
    }

    create() {
        this.controller = this.registry.get('controller');
        if (this.textures.exists('pepero-arena')) this.add.image(480, 360, 'pepero-arena').setDisplaySize(1280, 720);
        this.add.rectangle(480, 375, 890, 620, 0xfffaf3, 0.83).setStrokeStyle(2, 0xffffff, 0.8);
        this.add.text(45, 64, 'JUDY’S SWEET DEFENSE', { fontFamily: font, fontSize: '14px', color: '#ad6b55', letterSpacing: 3 });
        this.add.text(44, 91, '지니주디의 빼빼로 수호전', { fontFamily: font, fontSize: '31px', fontStyle: 'bold', color: '#532b31' });
        this.subtitle = this.add.text(45, 142, '', { fontFamily: font, fontSize: '15px', color: '#91545a' });
        for (const [index, y] of lanes.entries()) {
            this.add.rectangle(480, y, 840, 108, index % 2 ? 0xffe8da : 0xfff0e5, 0.9).setStrokeStyle(1, 0xeacbbd);
            this.add.text(68, y - 43, ['01 위', '02 가운데', '03 아래'][index], { fontFamily: font, fontSize: '12px', color: '#b98d7b' });
        }
        this.goal = this.add.image(888, 395, 'pepero-characters', 3).setDisplaySize(140, 270);
        this.add.text(851, 564, '빼빼로', { fontFamily: font, fontSize: '15px', color: '#744044' });
        const guard = this.add.image(-10, -5, 'pepero-characters', 2).setDisplaySize(112, 112);
        const label = this.add.text(0, 56, '지니주디', { fontFamily: font, fontSize: '15px', fontStyle: 'bold', color: '#7b3a48' }).setOrigin(0.5);
        this.shield = this.add.container(780, lanes[1], [guard, label]);
        this.message = this.add.text(480, 632, '', { fontFamily: font, fontSize: '21px', color: '#793f4c', align: 'center', wordWrap: { width: 800 } }).setOrigin(0.5);
        this.actors = new Map();
        this.handled = new Set();
        this.input.on('pointerdown', pointer => {
            this.controller.unlockSound();
            this.chooseLane(pointer);
        });
        this.input.on('pointermove', pointer => { if (pointer.isDown) this.chooseLane(pointer); });
        this.onKey = event => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || event.ctrlKey || event.metaKey) return;
            const code = event.code;
            const fixed = { Digit1: 0, Digit2: 1, Digit3: 2 };
            let lane = fixed[code];
            if (code === 'KeyW' || code === 'ArrowUp') lane = Math.max(0, (this.controller.state?.shieldLane ?? 1) - 1);
            if (code === 'KeyS' || code === 'ArrowDown') lane = Math.min(2, (this.controller.state?.shieldLane ?? 1) + 1);
            if (lane === undefined && code !== 'Space') return;
            event.preventDefault();
            this.controller.unlockSound();
            if (code === 'Space') this.controller.action(this.controller.state?.paused ? 'resume' : 'pause');
            else this.controller.action('lane', lane);
        };
        this.input.keyboard.on('keydown', this.onKey);
        this.receive(this.controller.state);
    }

    chooseLane(pointer) {
        if (pointer.y < 205 || pointer.y > 590) return;
        const lane = lanes.reduce((best, y, index) => Math.abs(pointer.y - y) < Math.abs(pointer.y - lanes[best]) ? index : best, 0);
        this.controller.action('lane', lane);
    }

    receive(state) {
        if (!this.actors || !state) return;
        const ids = state.attacks.map(attack => attack.id).join('|');
        if (ids !== this.attackIds) {
            for (const actor of this.actors.values()) actor.destroy();
            this.actors.clear();
            this.handled.clear();
            this.attackIds = ids;
            for (const attack of state.attacks) {
                const character = this.add.image(0, -7, 'pepero-characters', attack.isNpc ? 1 : 0).setDisplaySize(76, 76);
                const title = (attack.isNpc ? 'NPC · ' : '') + Array.from(attack.nickname).slice(0, 14).join('');
                const text = this.add.text(0, 30, title, { fontFamily: font, fontSize: '13px', color: '#55362f', backgroundColor: '#fffaf0', padding: { x: 5, y: 2 } }).setOrigin(0.5);
                this.actors.set(attack.id, this.add.container(100, lanes[attack.lane], [character, text]));
            }
        }
        if (this.previousPhase !== state.phase) {
            if (this.previousPhase && state.phase === 'attacking') this.controller.sound('start');
            if (state.phase === 'finished') this.controller.sound('win');
            this.previousPhase = state.phase;
        }
        for (const attack of state.attacks) {
            if (!attack.outcome || this.handled.has(attack.id)) continue;
            this.handled.add(attack.id);
            const hit = attack.outcome === 'hit';
            this.controller.sound(hit ? 'hit' : 'block');
            const effect = this.add.text(760, lanes[attack.lane] - 25, hit ? '한 입! −1' : '방어!', {
                fontFamily: font, fontSize: '24px', fontStyle: 'bold', color: hit ? '#c64b67' : '#288e8a'
            }).setOrigin(0.5);
            this.tweens.add({ targets: effect, y: effect.y - 35, alpha: 0, duration: 900, onComplete: () => effect.destroy() });
            if (hit) this.cameras.main.shake(100, 0.003);
        }
    }

    update(_time, delta) {
        const state = this.controller?.state;
        if (!state || !this.actors) return;
        const now = this.controller.time();
        this.shield.y = Phaser.Math.Linear(this.shield.y, lanes[state.shieldLane], Math.min(1, delta / 75));
        for (const attack of state.attacks) {
            const actor = this.actors.get(attack.id);
            if (!actor) continue;
            const progress = Phaser.Math.Clamp((now - attack.spawnAt) / (attack.impactAt - attack.spawnAt), 0, 1);
            actor.setVisible(!attack.outcome && now >= attack.spawnAt && state.phase === 'attacking');
            actor.x = Phaser.Math.Linear(110, 780, progress);
            actor.y = lanes[attack.lane] + Math.sin(progress * 35) * 3;
        }
        const remaining = Math.max(0, Math.ceil((state.recruitUntil - now) / 1000));
        this.subtitle.setText('WAVE ' + state.wave + ' / ' + state.totalWaves + '     방어 ' + state.blocked + '     남은 빼빼로 ' + state.health);
        this.message.setText(state.paused ? '잠깐 쉬어가기' : ({
            idle: '게임 시작을 누르면 시청자를 모집합니다',
            recruiting: '참가 모집 ' + remaining + '초 · 현재 ' + state.entrants + '명',
            attacking: '↑ ↓ · W S · 1 2 3 · 마우스로 길을 막아 주세요',
            between: '다음 웨이브를 눌러 다시 도전!',
            finished: state.winner === 'streamer' ? '주디 승리! 달콤한 방어 성공' : '시청자 승리! 잘 먹었습니다'
        })[state.phase]);
        if (!this.hudAt || _time - this.hudAt > 150) {
            this.hudAt = _time;
            this.controller.updateHud();
        }
    }
}
