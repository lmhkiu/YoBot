import config from '../../config.js';

export default class ChatMemoController {

    constructor() {
        this.memoFileName = null;
        this.broadcastTimer = null;
        this.broadcastStartTime = null;
        this.chatDisplay = null;
    }

    init(chatDisplay) {
        this.chatDisplay = chatDisplay;
        //컨트롤러 영역으로 따로 분리하는게 좋겠다. 클래스를 하나 더 만들자.
        const saveMemoBtn = document.getElementById('save-memo-btn');
        saveMemoBtn.addEventListener('click', this.saveMemo.bind(this));

        const memoInput = document.getElementById('memo-input');
        memoInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                if (event.shiftKey) {
                    // Shift+Enter: 줄바꿈 (기본 동작 허용)
                    return true;
                } else {
                    // Enter만 누른 경우: 메모 저장
                    event.preventDefault();
                    this.saveMemo();
                }
            }
        });
        
    }


    secondToTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // 브로드캐스트 시간 수신
    handleBroadTime(data) {
        console.log('방송 시간(초):', data);

        // 이미 broadcastStartTime이 설정되어 있다면 더 이상 처리하지 않음
        if (this.broadcastStartTime) {
            return;
        }
        // BTIME은 초 단위
        const totalSeconds = data;

        // 이미 타이머가 실행 중이면 중지
        if (this.broadcastTimer) {
            clearInterval(this.broadcastTimer);
        }

        // 시작 시간 기록
        this.broadcastStartTime = Date.now() - (totalSeconds * 1000);

        // 즉시 시간 표시
        this.updateBroadcastTime();

        // 1초마다 시간 업데이트
        this.broadcastTimer = setInterval(() => {
            this.updateBroadcastTime();
        }, 1000);
    }

    // 방송 시간 업데이트 함수
    updateBroadcastTime() {
        if (!this.broadcastStartTime) return;
        console.log('방송 시간 업데이트');
        const nowObject = new Date();
        const now = nowObject.getTime();
       
        const elapsedSeconds = Math.floor((now - this.broadcastStartTime) / 1000);
        const timeString = this.secondToTime(elapsedSeconds);
        console.log(`now : ${this.getCurrentTimestamp(nowObject)}`);
        console.log(`broadcastStartTime : ${this.getCurrentTimestamp(new Date(this.broadcastStartTime))}`);
        console.log(`elapsedSeconds : ${timeString}`);
        // HTML의 broad_time 요소 업데이트
        const broadTimeElement = document.getElementById('broad_time');
        if (broadTimeElement) {
            broadTimeElement.textContent = timeString;
        }
    }
    getCurrentTimestamp(now) {
        // yyyymmdd HH:MM:SS 형식으로 변경
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        // 수정할 라인:
        return `${year}${month}${day} ${hours}:${minutes}:${seconds}`;
    }

    isCommandRegister(inputText) {
        return config.BROADCAST_COMMANDS.registerCommands.some(cmd => inputText.startsWith(cmd+config.BROADCAST_COMMANDS.COMMANDS_SEPARATOR));
    }

    isCommandRemove(inputText) {
        return config.BROADCAST_COMMANDS.removeCommands.some(cmd => inputText.startsWith(cmd+config.BROADCAST_COMMANDS.COMMANDS_SEPARATOR));
    }
    
    // 명령어 처리 함수
    async processCommand(inputText) {
        const memoStatus = document.getElementById('memo-status');
        console.log("processCommand", inputText);
        // !명령어 입력 시 명령어 목록 표시
        if (inputText === config.BROADCAST_COMMANDS.getListCommand) {
            await this.displayCommandList();
            return true;
        }
        
        if(this.isCommandRemove(inputText)) {
            const commandName = inputText.substring(config.BROADCAST_COMMANDS.removeCommands[0].length+config.BROADCAST_COMMANDS.COMMANDS_SEPARATOR.length).trim();
            if (commandName) {
                try {
                    const result = await fetch('/api/command', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            action: 'remove',
                            command: commandName
                        })
                    });

                    const data = await result.json();
                    if (data.success) {
                        memoStatus.textContent = data.message;
                        memoStatus.style.color = '#4caf50';
                        
                        // 명령어 목록 자동 새로고침
                        setTimeout(async () => {
                            await this.displayCommandList();
                            memoStatus.textContent = '';
                        }, 1500);
                    } else {
                        memoStatus.textContent = data.message;
                        memoStatus.style.color = '#ff4444';
                        
                        setTimeout(() => {
                            memoStatus.textContent = '';
                        }, 2000);
                    }
                    
                } catch (error) {
                    console.error('명령어 제거 오류:', error);
                    memoStatus.textContent = '명령어 제거에 실패했습니다.';
                    memoStatus.style.color = '#ff4444';
                    
                    setTimeout(() => {
                        memoStatus.textContent = '';
                    }, 2000);
                }
                return true;
            }
        }

        // 명령어 등록: !명령어 !인사 안녕하세요.
        if (this.isCommandRegister(inputText)) {
            const parts = inputText.substring(config.BROADCAST_COMMANDS.registerCommands[0].length+config.BROADCAST_COMMANDS.COMMANDS_SEPARATOR.length).trim();
            
            // 첫 번째 공백을 기준으로 명령어와 응답 분리
            const firstSpaceIndex = parts.indexOf(config.BROADCAST_COMMANDS.COMMANDS_SEPARATOR);
            if (firstSpaceIndex === -1 ) {
                memoStatus.textContent = '올바른 형식: !명령어 !인사 안녕하세요.';
                memoStatus.style.color = '#ff4444';
                    
                setTimeout(() => {
                    memoStatus.textContent = '';
                }, 2000);
                return true;
            }

            const command = parts.substring(0, firstSpaceIndex).trim();
            const response = parts.substring(firstSpaceIndex + 1).trim();

            if(!command.startsWith(config.BROADCAST_COMMANDS.COMMANDS_PREFIX)) {
                memoStatus.textContent = '명령어는 ' + config.BROADCAST_COMMANDS.COMMANDS_PREFIX + '로 시작해야 합니다.';
                memoStatus.style.color = '#ff4444';
                    
                setTimeout(() => {
                    memoStatus.textContent = '';
                }, 2000);
                return true;
            }

            try {
                const result = await fetch('/api/command', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'register',
                        command: command,
                        response: response
                    })
                });

                const data = await result.json();
                
                memoStatus.textContent = data.message;
                memoStatus.style.color = data.success ? '#4caf50' : '#ff4444';
                
            } catch (error) {
                console.error('명령어 등록 오류:', error);
                memoStatus.textContent = '명령어 등록에 실패했습니다.';
                memoStatus.style.color = '#ff4444';
            }
                
            setTimeout(() => {
                memoStatus.textContent = '';
            }, 2000);
            return true;
        }

        // 일반 명령어 실행
        if (inputText.startsWith(config.BROADCAST_COMMANDS.COMMANDS_PREFIX)) {
            try {
                const result = await fetch('/api/command', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'execute',
                        command: inputText
                    })
                });

                const data = await result.json();
                
                if (data.success) {
                    this.showSystemMessage(data.response);
                } else {
                    memoStatus.textContent = data.message || '등록되지 않은 명령어입니다.';
                    memoStatus.style.color = '#ff4444';
                    
                    setTimeout(() => {
                        memoStatus.textContent = '';
                    }, 2000);
                }
                    
            } catch (error) {
                console.error('명령어 실행 오류:', error);
                memoStatus.textContent = '명령어 실행에 실패했습니다.';
                memoStatus.style.color = '#ff4444';
            }
            
            return true;
        }

        return false; // 명령어가 아님
    }

    async displayCommandList() {
        try {
            const result = await fetch('/api/command', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'list'
                })
            });

            const data = await result.json();
            
            if (data.success && data.commands.length > 0) {
                // 명령어 목록 메시지 생성
                let message = '';
                
                data.commands.forEach(([command, response]) => {

                    message += `${command} ${response}<br>`;
                
                });
                
                this.showSystemMessage(message);
            } else {
                this.showSystemMessage('등록된 명령어가 없습니다.');
            }
            
        } catch (error) {
            console.error('명령어 목록 조회 오류:', error);
            this.showSystemMessage('명령어 목록을 가져오지 못했습니다.');
        }
    }



    // 시스템 메시지 표시 함수
    showSystemMessage(message) {
        // ChatDisplay를 통해 시스템 메시지 표시
        if (this.chatDisplay) {

            const html = 
            `<div class="chat-message">
                <div class="chat-message-platform-icon-container">
                    <img src="/favicon.png" alt="favicon" style="width: 20px; height: 20px;">
                </div>
                <div class="chat-message-nickname-container">
                    <img class="chat-message-badge" src="./assets/chat/badge/fan_03.png" alt="badge" style="display: none;">
                    <div class="chat-message-nickname"><strong>YoBot</strong></div>
                </div>
                <div class="chat-message-content-container">${message}</div>
            </div>`;
            this.chatDisplay.addMessageToChat(html);
        }
    }

    async saveMemo() {
        const memoInput = document.getElementById('memo-input');
        const memoStatus = document.getElementById('memo-status');
        const broadTimeElement = document.getElementById('broad_time');

        if (memoInput.value.trim() === '') {
            memoStatus.textContent = '메모 내용을 입력해주세요.';
            memoStatus.style.color = '#ff4444';
            return;
        }


        const inputText = memoInput.value.trim();
 
        // 명령어 처리 먼저 확인
        const isCommand = await this.processCommand(inputText);
        if (isCommand) {
            memoInput.value = ''; // 명령어 처리 후 입력창 비우기
            return;
        }

        try {
            // 현재 방송 시간 가져오기
            const currentTime = broadTimeElement.textContent || '00:00:00';
            const memoContent = `${currentTime} ${memoInput.value.trim()}`;

            // 파일 이름 생성 (오늘 날짜)
            if (!this.memoFileName) {
                const today = new Date();
                const dateStr = today.getFullYear() +
                    String(today.getMonth() + 1).padStart(2, '0') +
                    String(today.getDate()).padStart(2, '0');
                this.memoFileName = `memo_${dateStr}.txt`;
            }

            // 서버에 메모 저장 요청
            const response = await fetch('/api/save-memo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fileName: this.memoFileName,
                    content: memoContent,
                    timestamp: this.getCurrentTimestamp(new Date())
                })
            });

            if (response.ok) {
                memoStatus.textContent = '메모가 저장되었습니다!';
                memoStatus.style.color = '#4caf50';
                memoInput.value = ''; // 입력창 비우기
            } else {
                throw new Error('저장 실패');
            }

        } catch (error) {
            console.error('메모 저장 오류:', error);
            memoStatus.textContent = '메모 저장에 실패했습니다.';
            memoStatus.style.color = '#ff4444';
        }

        // 2초 후 상태 메시지 초기화
        setTimeout(() => {
            memoStatus.textContent = '';
        }, 2000);
    }

    destroy() {
        if (this.broadcastTimer) {
            clearInterval(this.broadcastTimer);
            this.broadcastTimer = null;
        }

    }

}