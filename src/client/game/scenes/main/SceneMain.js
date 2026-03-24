export default class SceneMain extends Phaser.Scene{

    constructor(){
        super('SceneMain');

    }

    preload(){
        this.load.image('bgMain', '../../assets/bg/background.png');
    }

    create(){
        this.add.image(0, 0, 'bgMain').setOrigin(0);
    }


}