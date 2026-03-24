import config from "../../../config.js";

export default class ChzzkFormatter {

    constructor() {
        this.platformImg = "<img class='chat-message-platform-icon' src='./assets/chat/icon/chzzk/icon_24.png'>";
    }

    format(chat) {
        console.log("ChzzkFormatter format", chat);
        const profileData = JSON.parse(chat.profile);

        const extras = JSON.parse(chat.extras);
        const emojis = extras.emojis || {};
        let content = chat.msg;

        // 이모티콘이 있을 경우에만 변환
        if (Object.keys(emojis).length > 0) {
            content = content.replace(/\{:([^:]+):\}/g, (match, emojiName) => {
                if (emojis[emojiName]) {
                    return `<img class="chat-message-emote" alt="" src="${emojis[emojiName]}">`;
                }
                return match;
            });
        }

        const html = 
        `<div class="chat-message">
            <div class="chat-message-platform-icon-container">${this.platformImg}</div>
            <div class="chat-message-nickname-container">
                <img class="chat-message-badge" src="./assets/chat/badge/fan_03.png" alt="badge" style="display: none;">
                <div class="chat-message-nickname">${profileData.nickname}</div>
            </div>
            <div class="chat-message-content-container">${content}</div>
        </div>`;
        return html;
        
      
    }
}
