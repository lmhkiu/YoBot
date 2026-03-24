export default class ChatMemoController {

    constructor() {
        this.memoFileName = null;
        this.broadcastTimer = null;
        this.broadcastStartTime = null;
    }

    init() {
        //컨트롤러 영역으로 따로 분리하는게 좋겠다. 클래스를 하나 더 만들자.
        const saveMemoBtn = document.getElementById('save-memo-btn');
        saveMemoBtn.addEventListener('click', this.saveMemo.bind(this));
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

        const elapsedSeconds = Math.floor((Date.now() - this.broadcastStartTime) / 1000);
        const timeString = this.secondToTime(elapsedSeconds);

        // HTML의 broad_time 요소 업데이트
        const broadTimeElement = document.getElementById('broad_time');
        if (broadTimeElement) {
            broadTimeElement.textContent = timeString;
        }
    }
    getCurrentTimestamp() {
        // yyyymmdd HH:MM:SS 형식으로 변경
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        // 수정할 라인:
        return `${year}${month}${day} ${hours}:${minutes}:${seconds}`;
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
                    timestamp: this.getCurrentTimestamp()
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

    destroy(){
        if (this.broadcastTimer) {
            clearInterval(this.broadcastTimer);
            this.broadcastTimer = null;
        }

    }

}