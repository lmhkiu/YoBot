import GameController from "./game/GameController.js";
import ChatDisplay from "./chat/ChatDisplay.js";
import ChatMemoController from "./chat/ChatMemoController.js";


let chatDisplay;
let chatMemoController;

try {

    // const gameController = new GameController();
    // gameController.init();

    chatDisplay = new ChatDisplay();
    chatMemoController = new ChatMemoController();

    await chatDisplay.init(chatMemoController);
    chatMemoController.init(chatDisplay);


} catch (error) {
    console.error(error);
}




window.addEventListener('beforeunload', () => {
    //if (gameController) gameController.destroy();
    if (chatDisplay) chatDisplay.destroy();
    if (chatMemoController) chatMemoController.destroy();
});


