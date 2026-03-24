"use strict";
export default class SceneGame extends Phaser.Scene {
    //1. 생성자
    constructor() {
        super();
        this.player = null;
        this.cursors = null;
        this.speed = 200; // 이동 속도
    }

    //2. 초기화
    init(){

    }

    //3. 에셋 로드
    preload() {
        // 에셋 로드
        this.load.image('background', '../../../assets/game/bg/background.png');
        this.load.image('player', '../../../assets/game/player/squirrel.png');
    }

    //4. 씬 생성
    create() {
        // 배경 추가
       
        this.createBackground();
        this.createPlayer();
        this.setKeys();
        this.setCamera();

        // 안내 텍스트
        this.add.text(20, 20, '화살표 키로 이동하세요', {
            fontSize: '20px',
            fill: '#000'
        });
    }
    createBackground(){
        const rect = this.add.image(0, 0, 'background');
        rect.setOrigin(0, 0);
    }

    createPlayer() {
        this.player = this.physics.add.sprite(400, 300, 'player').setOrigin(0.5, 0.5);
        this.player.setCollideWorldBounds(true); // 화면 밖으로 나가지 않도록
    }
    setKeys() {
        // 키보드 입력 활성화
        // create() 메서드 내에 추가
        this.keys = this.input.keyboard.addKeys('W,A,S,D,SPACE,SHIFT'); // 감지할 키 설정
    }

    setCamera() {
        // 카메라 설정
        this.cameras.main.centerOn(400, 300);
        this.cameras.main.startFollow(this.player);  // 플레이어를 따라가기
        this.cameras.main.setZoom(1.5);  // 확대/축소 (선택사항)
        this.cameras.main.setBounds(0, 0, 1280, 720);  // 카메라 이동 제한 (선택사항)

        // 부드러운 카메라 이동 (선택사항)
        this.cameras.main.setLerp(0.1, 0.1);  // 값이 클수록 부드러워짐 (0~1)
    }


    update() {
        // 속도 초기화
        this.player.setVelocity(0);

        // W, A, S, D 키 입력 처리
        if (this.keys.A.isDown) {
            this.player.setVelocityX(-this.speed);
        } else if (this.keys.D.isDown) {
            this.player.setVelocityX(this.speed);
        }

        if (this.keys.W.isDown) {
            this.player.setVelocityY(-this.speed);
        } else if (this.keys.S.isDown) {
            this.player.setVelocityY(this.speed);
        }

        // 스페이스바 감지
        if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) {
            console.log('점프!');
            // 점프 동작 구현
        }

        // 쉬프트 키 (달리기)
        if (this.keys.SHIFT.isDown) {
            this.player.setVelocityX(this.player.body.velocity.x * 1.5);
            this.player.setVelocityY(this.player.body.velocity.y * 1.5);
        }
    }
}


