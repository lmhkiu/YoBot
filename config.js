// config.js
const config = {
    "SCENE_KEY": {
        "GAME": "SceneGame",
        "MAIN": "SceneMain"
    },
    "MAX_MESSAGES": 200,
    "SCROLL": {
        "BOTTOM_TOLERANCE": 10
    },
    "PORT": {
        "SERVER": 13101,
        "CHAT_DISPLAY": 13102
    },
    "PLATFORM_TYPE": {
        "CHZZK": "chzzk",
        "SOOP": "soop",
        "TWITCH": "twitch"
    },
    "CHZZK": {
        "URL": "wss://kr-ss1.chat.naver.com/chat",
        "WS_URL": "wss://kr-ss3.chat.naver.com/chat",
        "CHANNEL_ID": "502f2a93037ff6984286d4104c1cac73"
    },
    "SOOP": {
        "CHANNEL_ID": "kimjudy",
        "WS_URL": "wss://soop.live/chat",
        "PLAYER_API_URL": "https://live.afreecatv.com/afreeca/player_live_api.php",
        "CHAT_INFO_CACHE_FILE": "./soop_chat_info_cache.json"
    },
    "TWITCH": {
        "CHANNEL_ID": "jinijudy",
        "BOT_USERNAME": "꾸덕이"
    },
    "UPDATE": {
        "GITHUB_OWNER": "lmhkiu",
        "GITHUB_REPO": "YoBot",
        "AUTO_UPDATE": true,
        "BACKUP_ENABLED": true,
        "GIST": {
            "TOKEN": "pnybXeIyty6Oh76R6YPQ3Rp4eTin0M0P0e3r",
            "MAX_GISTS": 100,
            "SYNC_WITH_SERVER": true
        },
        "BACKUP_INTERVAL": 60000
    }
};
 
export default config;