import config from "../../../config.js";
import { WebSocketServer } from 'ws';
// 채팅 서버에 연결하여 채팅을 가져온다. 우선 치지직만 가져온다.

export default class BaseChatScrapper {
    
    constructor() {
        this.platformName = null;
        this.clients = [];
    }

    


}