// config.js
const config = {
    "SCENE_KEY": {
        "GAME": "SceneGame",
        "MAIN": "SceneMain"
    },
    "MAX_MESSAGES": 200,
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
        "CHANNEL_ID": "bb382c2c0cc9fa7c86ab3b037fb5799c"
    },
    "SOOP": {
        "CHANNEL_ID": "iamquaddurup",
        "WS_URL": "wss://soop.live/chat",
        "PLAYER_API_URL": "https://live.afreecatv.com/afreeca/player_live_api.php",
        "CHAT_INFO_CACHE_FILE": "./soop_chat_info_cache.json"
    },
    "TWITCH": {
        "CHANNEL_ID": "lmhki",
        "BOT_USERNAME": "꾸덕이"
    },
    "UPDATE": {
        "GITHUB_OWNER": "lmhkiu",
        "GITHUB_REPO": "YoBot",
        "AUTO_UPDATE": true,
        "BACKUP_ENABLED": true
    }
};
 
export default config;