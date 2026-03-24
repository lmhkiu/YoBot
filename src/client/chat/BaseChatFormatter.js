//ChatScrapper와 통신하여 전달받은 chat data를 html 태그로 변환하여 index.html에 추가하는 역할.
//즉 소켓 통신도 초기에 이뤄져야 한다. 
import config from "../../config.js";

export default class ChatFormatter {

    constructor() {
        this.ws = null;
        this.chat = null;
    }

    async init() {
        this.ws = new WebSocket(`ws://localhost:${config.PORT.FORMATTER}`);
        this.ws.onmessage = (event) => {
            this.chat = null;
            const chat = JSON.parse(event.data);
            const profileData = JSON.parse(chat.profile);

            const extras = JSON.parse(chat.extras);
            const emojis = extras.emojis || {};
            let content = chat.msg;

            // 이모티콘이 있을 경우에만 변환
            if (Object.keys(emojis).length > 0) {
                content = content.replace(/\{:([^:]+):\}/g, (match, emojiName) => {
                    if (emojis[emojiName]) {
                        return `<img alt="" width="24" height="24" src="${emojis[emojiName]}">`;
                    }
                    return match;
                });
            }

            const html = `<div><strong>${profileData.nickname}:</strong> ${content}</div>`;

            const chatMessages = document.getElementById('chat-messages');

            if (chatMessages.children.length >= config.MAX_MESSAGES) {
                chatMessages.removeChild(chatMessages.firstChild);
            }

            chatMessages.insertAdjacentHTML('beforeend', html);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            this.chat = chat;
        };
    }
}


