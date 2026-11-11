import GameController from "./game/GameController.js";
import ChatDisplay from "./chat/ChatDisplay.js";
import ChatMemoController from "./chat/ChatMemoController.js";


let gameController;
let chatDisplay;
let chatMemoController;

try {

    chatDisplay = new ChatDisplay();
    chatMemoController = new ChatMemoController({ onGameMode: openGameMode });
    document.getElementById('game-exit').addEventListener('click', closeGameMode);

    await chatDisplay.init(chatMemoController);
    chatMemoController.init(chatDisplay);


} catch (error) {
    console.error(error);
}




async function openGameMode() {
    if (gameController) return;
    const controller = new GameController();
    gameController = controller;
    try {
        await controller.init();
    } catch (error) {
        controller.destroy();
        if (gameController === controller) gameController = null;
        throw error;
    }
}

function closeGameMode() {
    if (!gameController) return;
    gameController.destroy();
    gameController = null;
    document.getElementById('memo-input').focus();
}

window.addEventListener('beforeunload', () => {
    if (gameController) gameController.destroy();
    if (chatDisplay) chatDisplay.destroy();
    if (chatMemoController) chatMemoController.destroy();
});


