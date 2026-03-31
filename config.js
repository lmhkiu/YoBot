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
        "WS_SERVERS": [
            "wss://kr-ss1.chat.naver.com/chat",
            "wss://kr-ss2.chat.naver.com/chat",
            "wss://kr-ss3.chat.naver.com/chat",
            "wss://kr-ss4.chat.naver.com/chat",
            "wss://kr-ss5.chat.naver.com/chat"
        ],
        "CHANNEL_ID": "19e3b97ca1bca954d1ac84cf6862e0dc",
        "WS_VERSION": "3",
        "WS_URL": "undefined"
    },
    "SOOP": {
        "CHANNEL_ID": "goodb99",
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
    },
    "BROADCAST_COMMANDS": {
        "COMMANDS_FILE": "broadcast_commands.txt",
        "gistId": "d0e8937cfe41b4be97ded7c4905218ee",
        "url": "https://gist.github.com/lmhkiu/d0e8937cfe41b4be97ded7c4905218ee",
        "COMMANDS_SEPARATOR": " ",
        "COMMANDS_PREFIX": "!",
        "getListCommand": "!명령어",
        "registerCommands": [
            "!명령어등록",
            "!명령어"
        ],
        "removeCommands": [
            "!명령어삭제",
            "!명령어제거"
        ]
    },
    "CHAT_DISPLAY": {
        "KEEPALIVE_INTERVAL": 10000,
        "PREEMPTIVE_RECONNECT_DELAY": 270000,
        "MESSAGE_BUFFER_DURATION": 300000
    },
    "SERVER": {
        "SHUTDOWN_DELAY": 5000
    }
};
 
export default config;