export default class TwitchFormatter {
 
    constructor() {
    }
 
    format(chat) {
        const platformImg = "<img src='./assets/chat/icon/twitch/icon_24.png' class='platform-icon'>";
        const userId = chat.userId;
        const nickname = chat.nickname;
        const content = chat.content;
        const msgTime = chat.msgTime;
        const color = chat.color;
        const badges = chat.badges;
        const emotes = chat.emotes; // 이모티콘 데이터
 
        // 배지 처리
        let badgeHtml = this.getBadgeHtml(badges);
 
        // 이모티콘 처리된 콘텐츠
        const processedContent = this.processEmotes(content, emotes);
 
        // 특수 유저 상태 아이콘 추가
        let statusIcons = '';
 

        const html = 
        `<div class="chat-message" data-message-id="${chat.messageId}" data-room-id="${chat.roomId}">
            <div class="chat-message-platform-icon-container">${platformImg}</div>
            <div class="chat-message-nickname-container">
                <img class="chat-message-badge" src="./assets/chat/badge/fan_03.png" alt="badge" style="display: none;">
                <div class="chat-message-nickname">${nickname}</div>
            </div>
            <div class="chat-message-content-container">${processedContent}</div>
        </div>`;
        return html;

        // 최종 HTML 생성
        return `
            <div class="chat-message twitch-message" data-message-id="${chat.messageId}" data-room-id="${chat.roomId}">
                <div class="chat-header">
                    ${platformImg}
                    ${badgeHtml}
                    <span class="username"><strong>${nickname}:</strong></span>
                    ${statusIcons}
                </div>
                <div class="chat-content">${processedContent}</div>
            </div>
        `;
    }
 
    // processEmotes 메소드 완전 재작성
    processEmotes(content, emotes) {
        if (!emotes || emotes === '') {
            return content;
        }
    
        // 이모티콘 파싱: "30259:0-6,8-14,16-22/425618:24-26,28-30,32-34"
        let replacements = [];
        
        // 슬래시(/)로 이모티콘 그룹 분리
        const emoteGroups = emotes.split('/');
        
        emoteGroups.forEach(emoteGroup => {
            const [emoteId, positions] = emoteGroup.split(':');
            
            if (!positions) return;
            
            // 쉼표(,)로 위치 분리
            const positionList = positions.split(',').map(pos => {
                const [start, end] = pos.split('-').map(Number);
                return { 
                    emoteId, 
                    start, 
                    end,
                    emoteText: content.substring(start, end + 1)
                };
            });
            
            replacements.push(...positionList);
        });
        
        // 시작 위치 기준 내림차순 정렬 (뒤에서부터 교체해야 인덱스 꼬이지 않음)
        replacements.sort((a, b) => b.start - a.start);
        
        let processedContent = content;
        
        // 각 이모티콘을 HTML로 교체
        replacements.forEach(({ emoteId, start, end, emoteText }) => {
            const emoteHtml = this.createEmoteHtml(emoteId, emoteText);
            
            processedContent = processedContent.substring(0, start) + 
                              emoteHtml + 
                              processedContent.substring(end + 1);
        });
        
        return processedContent;
    }
 
    // createEmoteHtml 메소드는 동일
    createEmoteHtml(emoteId, emoteName) {
        const baseUrl = "https://static-cdn.jtvnw.net/emoticons/v2/";
        const emoteUrl = `${baseUrl}${emoteId}/default/light/1.0`;
        const srcset = `${baseUrl}${emoteId}/default/light/1.0 1x,${baseUrl}${emoteId}/default/light/2.0 2x,${baseUrl}${emoteId}/default/light/3.0 4x`;
        
        return `<img alt="${emoteName}" class="chat-message-emote" src="${emoteUrl}" srcset="${srcset}">`;
    }

    getBadgeHtml(badges) {
        //일단 뱃지 아이콘은 추후에 추가할 예정
        let badgeHtml = '';
        // if (badges) {
        //     const badgeList = badges.split(',');
        //     badgeHtml = badgeList.map(badge => {
        //         // 배지 종류에 따른 아이콘 매핑
        //         switch(badge) {
        //             case 'broadcaster/1':
        //                 return '<img src="./assets/chat/badge/broadcaster.png" class="badge-icon">';
        //             case 'subscriber/0':
        //                 return '<img src="./assets/chat/badge/subscriber.png" class="badge-icon">';
        //             case 'moderator/1':
        //                 return '<img src="./assets/chat/badge/moderator.png" class="badge-icon">';
        //             default:
        //                 return '';
        //         }
        //     }).join('');
        // }
        return badgeHtml;
    }
}