// src/server/utils/crypto.js
export class SimpleCrypto {
    // 암호화: ASCII 코드 +1
    static encrypt(text) {
        return text.split('').map(char => {
            const code = char.charCodeAt(0);
            return String.fromCharCode(code + 1);
        }).join('');
    }
    
    // 복호화: ASCII 코드 -1
    static decrypt(encrypted) {
        return encrypted.split('').map(char => {
            const code = char.charCodeAt(0);
            return String.fromCharCode(code - 1);
        }).join('');
    }
}