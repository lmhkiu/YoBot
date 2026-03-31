export default class SoopFormatter {
    constructor() {

    }



    format(chat) {
        const platformImg = "<img class='chat-message-platform-icon' src='./assets/chat/icon/soop/icon_24.png'>";
        let ret = null;
        if (chat.type === 'sticker') {
            //<img class="emoticon" src="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/6460cd0322470/9_80.webp?ver=1" data-default-img="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/6460cd0322470/9_80.webp?ver=1" data-static-img="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/6460cd0322470/9_80.png?ver=1" alt="OGQ 이모티콘 이미지" onerror="this.onerror=null;this.src='https://res.sooplive.co.kr/images/chat/ogq_default.svg'"></img>
            const img = `<img class="chat-emote" src="https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/${chat.stickerId}/${chat.stickerNum}_80.${chat.extension}?ver=1" onerror="this.src='https://res.sooplive.co.kr/images/chat/ogq_default.svg'">`;

            chat.content = chat.content.replace(/\n/g, '<br>');

            ret = `
                <div class="chat-message">
                    <div class="chat-message-platform-icon-container">${platformImg}</div>
                    <div class="chat-message-nickname-container">
                        <img class="chat-message-badge" alt="badge" style="display: none;">
                        <div class="chat-message-nickname">${chat.nickname}</div>
                    </div>
                    <div class="chat-message-content-container"> ${img}${chat.content}</div>
                </div>`;
        } else if (chat.type === 'donation') {

            const img = `<img src="https://res.sooplive.co.kr/new_player/items/m_balloon_${chat.amount}.png" alt="별풍선">`;
            ret = `
                <div class="chat-message">
                    <div class="chat-message-platform-icon-container">${platformImg}</div>
                    <div class="chat-message-nickname-container">
                        <img class="chat-message-badge" alt="badge" style="display: none;">
                        <div class="chat-message-nickname">${chat.nickname}</div>
                    </div>
                    <div class="chat-message-content-container"> ${img} ${chat.content} ${chat.amount}개</div>
                </div>`;
        } else {

            // 내장 이모티콘 처리: /샤방/ 패턴을 찾아 변환
            chat.content = chat.content.replace(/\/([^\/]+)\//g, (match) => {

                const imgTag = this.getBuiltinEmoticonNumber(match);
                //움직이는 이모티콘은 주소와 번호가 다르다. 이것 파싱할 수 있는 함수 필요.
                //https://res.sooplive.co.kr/images/chat/emoticon/big/gudok/movingEmoticon/webp/6.webp
                if (imgTag) {
                    return imgTag;
                }
                return match; // 매칭되지 않으면 원본 유지
            });

            chat.content = chat.content.replace(/\n/g, '<br>');

            ret = `
            <div class="chat-message">
                <div class="chat-message-platform-icon-container">${platformImg}</div>
                <div class="chat-message-nickname-container">
                    <img class="chat-message-badge" alt="badge" style="display: none;">
                    <div class="chat-message-nickname">${chat.nickname}</div>
                </div>
                <div class="chat-message-content-container">${chat.content}</div>
            </div>`;
        }

        //console.log("SoopFormatter format", ret);


        return ret;
    }

    parseGrade(userFlag) {
        // Simple parsing, adjust as needed
        if (userFlag.includes('538001440')) return { grade: 'fan', char: 'F', tip: '팬클럽' };
        return { grade: 'normal', char: '', tip: '' };
    }

    getBuiltinEmoticonNumber(emoticonText) {
        let res = null;
        const map = {
            '/샤방/': 1,
            '/윽/': 2,
            '/휘파람/': 3,
            '/짜증/': 4,
            '/헉/': 5,
            '/하이/': 6,
            '/개좋아/': 7,
            '/개도발/': 8,
            '/개털림/': 9,
            '/개감상/': 10,
            '/개화나/': 11,
            '/개이득/': 12,
            '/개번쩍/': 13,
            '/짱좋아/': 94,
            '/피식/': 95,
            '/헐/': 96,
            '/감상중/': 97,
            '/화나/': 98,
            '/하하/': 99,
            '/ㅠㅠ/': 100,
            '/화이팅/': 102,
            '/주작/': 14,
            '/꿀잼/': 15,
            '/업/': 16,
            '/갑/': 17,
            '/묻/': 18,
            '/심쿵/': 19,
            '/스겜/': 20,
            '/추천/': 21,
            '/인정/': 22,
            '/사이다/': 23,
            '/더럽/': 24,
            '/극혐/': 25,
            '/매너챗/': 26,
            '/강퇴/': 27,
            '/드루와/': 28,
            '/야광봉/': 103,
            '/아잉/': 29,
            '/기겁/': 30,
            '/우울/': 31,
            '/쳇/': 32,
            '/ㅋㅋ/': 33,
            '/졸려/': 34,
            '/최고/': 35,
            '/엉엉/': 36,
            '/후훗/': 37,
            '/부끄/': 38,
            '/제발/': 39,
            '/덜덜/': 40,
            '/좋아/': 41,
            '/반함/': 42,
            '/멘붕/': 43,
            '/버럭/': 44,
            '/우엑/': 45,
            '/뽀뽀/': 46,
            '/심각/': 47,
            '/쥘쥘/': 48,
            '/헤헤/': 50,
            '/훌쩍/': 49,
            '/코피/': 51,
            '/철컹철컹/': 52,
            '/섬뜩/': 53,
            '/꺄/': 54,
            '/굿/': 55,
            '/글썽/': 56,
            '/황당/': 57,
            '/정색/': 58,
            '/피곤/': 59,
            '/사랑/': 60,
            '/좌절/': 61,
            '/사탕/': 62,
            '/RIP/': 63,
            '/건빵/': 64,
            '/사과/': 65,
            '/귤/': 93,
            '/겁나좋군/': 66,
            '/근육녀/': 101,
            '/근육남/': 67,
            '/박수/': 68,
            '/소주/': 71,
            '/짱/': 72,
            '/꽃/': 73,
            '/왕/': 74,
            '/썰렁/': 75,
            '/무지개/': 76,
            '/태극기/': 77,
            '/절교/': 78,
            '/하트/': 79,
            '/불/': 80,
            '/별/': 81,
            '/폭탄/': 82,
            '/폭죽/': 83,
            '/보석/': 84,
            '/금/': 85,
            '/돈/': 86,
            '/맥주/': 87,
            '/입술/': 88,
            '/콜!/': 89,
            '/번쩍/': 90,
            '/19/': 91,
            '/즐거워/': 92,
            '/케이크/': 69,
            '/약/': 70
        };

        const map2 = {
            '/푸하하/': 'movingEmoticon/webp/6.webp',
            '/분노/': 'movingEmoticon/webp/4.webp',
            '/궁금/': 'movingEmoticon/webp/3.webp',
            '/눈물/': 'movingEmoticon/webp/5.webp',
            '/쪽/': 'movingEmoticon/webp/2.webp',
            '/놀람/': 'movingEmoticon/webp/1.webp',
            '/확인요/': 'S101.png',
            '/미션/': 'S102.png',
            '/ㅇㅋ/': 'S103.png',
            '/티키타카/': 'S104.png',
            '/ㄱㄴㅇ/': 'S105.png',
            '/동의/': 'S106.png',
            '/굿밤/': 'S107.png',
            '/맴찢/': 'S108.png',
            '/나이따/': 'S109.png',
            '/ㄱㄱ/': 'S110.png',
            '/조오치/': 'S111.png',
            '/ㄴㅇㅂㅈ/': 'S112.png',
            '/데헷/': 'S113.png',
            '/런/': 'S114.png',
            '/각/': 'S115.png',
            '/실화/': 'S116.png',
            '/ㅇㅈ/': 'S117.png',
            '/ㅇㄱㄹㅇ/': 'S118.png',
            '/반사/': 'S119.png',
            '/TMI/': 'S120.png',
            '/JMT/': 'S121.png',
            '/할많하않/': 'S122.png',
            '/현타/': 'S123.png',
            '/엄근진/': 'S124.png',
            '/머쓱/': 'S125.png',
            '/탈룰라/': 'S126.png',
            '/누나/': 'S127.png',
            '/탈주/': 'S128.png',
            '/손절/': 'S129.png',
            '/하락/': 'S130.png',
            '/씨익/': 'S131.png',
            '/양머리/': 'S132.png',
            '/마스크/': 'S133.png',
            '/좌정권/': 'S134.png',
            '/우정권/': 'S135.png',
            '/천사/': 'S136.png',
            '/악마/': 'S137.png',
            '/청순/': 'S138.png',
            '/신랑/': 'S139.png',
            '/신부/': 'S140.png'
        };

        let imgUrl = null;
        const baseUrl = "https://res.sooplive.co.kr/images/chat/emoticon/big/";
    
        if (map[emoticonText]) {
            const imgNum = map[emoticonText];
            imgUrl = `${baseUrl}${imgNum}.png`;
        } else if (map2[emoticonText]) {
            imgUrl = `${baseUrl}gudok/${map2[emoticonText]}`;
        }
    
        if (imgUrl) {
            return `<img class="chat-message-emote" src="${imgUrl}" alt="${emoticonText}" onerror="this.src='https://res.sooplive.co.kr/images/chat/ogq_default.svg'">`;
        }
        
        return null;
    }



}