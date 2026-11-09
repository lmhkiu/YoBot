# YoBot

치지직·숲·트위치 통합 채팅 프로그램입니다.

## Windows에서 실행

1. GitHub에서 **Code → Download ZIP** 또는 **Releases → YoBot.zip**으로 다운로드합니다. 두 ZIP에 같은 실행 파일과 설정이 들어 있습니다.
2. 별도 폴더에 압축을 풀고, 안에 있는 **run.bat**을 실행합니다.
3. 설정 화면에서 채널 ID를 확인하고 시작합니다.

Node.js와 필요한 라이브러리가 포함되어 있어 별도 설치는 필요 없습니다. Windows x64용입니다. 기본 설정을 그대로 쓸 경우 config.js를 옮길 필요가 없습니다. 기존 개인 설정을 유지하려는 사용자만 이전 config.js를 새 폴더에 복사하세요. 사용자 채팅 기록은 같은 Windows 계정에서 유지됩니다.

새 실행기로 전환한 이후에는 run.bat 실행 시 GitHub의 최신 완성 패키지를 확인합니다. 자동 업데이트 시 ZIP의 config.js 전체를 설치 폴더의 config.js에 복사합니다. 이전 config.js는 .update의 롤백 폴더에 보관하며, 메모와 로컬 채팅 DB는 유지합니다. 인터넷 연결이나 패키지 검증에 문제가 있으면 기존 설치 버전을 실행합니다.

## Gist 메모 백업

새 메모는 마지막 입력 후 5초가 지나면 업로드하며, 실패 시 15초 뒤 재시도합니다. 메모 화면에서 업로드 완료와 오류를 확인할 수 있습니다.

채팅을 시작하면 이 PC의 `memo` 폴더에 남아 있는 날짜별 메모를 비공개 Gist와 대조합니다. 같은 날짜 파일이 있으면 기존 내용 뒤에 누락된 메모만 추가하고, 날짜 파일 자체가 없으면 새 비공개 Gist를 만듭니다. 다른 PC의 로컬 메모는 해당 PC에서 YoBot을 업데이트하고 채팅을 시작하면 대조합니다. 백업 과정에서 기존 Gist를 자동 삭제하지 않습니다.


## 개발·배포

개발 환경은 Node.js 24.13.0 이상이 필요합니다.

- 개발 실행: npm start
- 기록 테스트: npm run test:history
- 업데이트 테스트: npm run test:bundle
- Windows 패키지 생성: npm run build:release
- 배포 ZIP에는 로컬 config.js의 Gist 토큰이 포함됩니다. 공개 릴리스에서 ZIP을 받는 사람은 이 토큰도 볼 수 있습니다.

소스 변경을 커밋하고 npm run build:release로 ZIP을 만듭니다. npm run stage:main으로 같은 실행 파일을 Git에 스테이징하고 main ZIP의 파일이 배포 ZIP과 일치하는지 검증합니다. 번들을 커밋한 뒤 같은 커밋을 태그하고 dist/YoBot.zip과 dist/YoBot.zip.sha256을 릴리스에 첨부합니다. 구체적인 절차는 'git 배포 방법', 기록 기능은 CHAT_HISTORY.md를 참고하세요.
