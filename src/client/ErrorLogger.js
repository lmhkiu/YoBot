// src/ErrorLogger.js
export default class ErrorLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.handleError = this.handleError.bind(this);
        this.handleRejection = this.handleRejection.bind(this);
    }
    
    init() {
        this.setupErrorHandlers();
        this.setupConsoleOverride();
    }
    
    setupConsoleOverride() {
        const originalConsoleError = console.error;
        const self = this;
        
        console.error = (...args) => {
            originalConsoleError.apply(console, args);
            self.logClientError(new Error(args.join(' ')), 'Console Error');
        };
    }
    
    // 전역 오류 핸들러
    setupErrorHandlers() {
        window.addEventListener('error', this.handleError);
        window.addEventListener('unhandledrejection', this.handleRejection);
    }
    
    handleError(event) {
        this.logClientError(event.error, `Window Error: ${event.message}`);
    }
    
    handleRejection(event) {
        this.logClientError(event.reason, `Unhandled Rejection: ${event.reason}`);
    }
    
    logClientError(error, context = '') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${context}] ${error.stack || error.toString()}\n`;
        
        // 로그 배열에 추가
        this.logs.push(logEntry);
        
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // 세션 스토리지에 저장
        //sessionStorage.setItem('lastError', logEntry);
        //sessionStorage.setItem('errorLogs', JSON.stringify(this.logs));
        
        // 즉시 다운로드
        //this.downloadLog(logEntry);
    }
    
    downloadLog(logEntry) {
        const blob = new Blob([logEntry], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    

    
    destroy() {
        // 이벤트 리스너 정리
        window.removeEventListener('error', this.handleError);
        window.removeEventListener('unhandledrejection', this.handleRejection);
        
        // console.error 복원 (필요시)
        // console.error = originalConsoleError;
    }
}