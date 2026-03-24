// GameController.js
"use strict";
import SceneGame from "./scenes/game/SceneGame.js";
import SceneMain from "./scenes/main/SceneMain.js";
import config from "../../config.js";

export default class GameController {
    
    constructor() {
        this.game = null;
        this.config = {
            type: Phaser.AUTO,
            width: 640,    
            height: 360,    
            parent: 'game-container', // 캔버스를 game-container에 추가
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 },
                    debug: true
                }
            },
            fps: {
                target: 60,              // 목표 FPS
                min: 30,                 // 최소 FPS
                forceSetTimeOut: false,  // false가 기본값
                smoothStep: true         // 부드러운 프레임 조정
            },
            
        };

            
    }
    
    init() {
         

        // 게임 인스턴스 생성
        this.game = new Phaser.Game(this.config);
        
        // 메뉴 추가
        this.game.scene.add(config.SCENE_KEY.GAME, SceneGame);
        this.game.scene.add(config.SCENE_KEY.MAIN, SceneMain);

        // 메뉴 시작
        this.game.scene.start(config.SCENE_KEY.GAME);
        

        
    }
    
    
    // 기타 게임 전반적인 기능들...
    saveGame() { /* 저장 로직 */ }
    loadGame() { /* 불러오기 로직 */ }
    setVolume(level) { /* 볼륨 조절 */ }
   

}