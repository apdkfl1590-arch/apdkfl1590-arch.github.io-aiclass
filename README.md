# WELD-AI 용접 품질 검사

웹 화면과 분석 API를 하나의 Node.js 서버에서 제공하는 앱입니다.

## 로컬 실행

1. Node.js 22 이상을 설치합니다.
2. 프로젝트 루트에 `.env` 파일을 만들고 `OPENAI_API_KEY=...`를 설정합니다. 현재 사용 중인 `node_modules/myopenaikey.env` 키 파일도 로컬 개발에서는 계속 사용할 수 있습니다.
3. 프로젝트 루트에서 다음 명령을 실행합니다.

   ```sh
   npm install
   npm start
   ```

4. 브라우저에서 `http://localhost:3000`을 엽니다.

## Render 배포

1. GitHub 저장소에 프로젝트를 올립니다. `node_modules`와 `.env`는 `.gitignore`로 제외되어야 합니다.
2. Render에서 **New + → Blueprint**를 선택하고 저장소를 연결합니다. 저장소의 `render.yaml`이 Node 서버를 빌드하고 실행합니다.
3. Render 대시보드의 서비스 **Environment** 설정에서 `OPENAI_API_KEY`를 비밀 환경 변수로 등록합니다. 실제 키를 GitHub나 `render.yaml`에 넣지 마세요.
4. 배포가 완료되면 Render가 제공한 HTTPS 주소로 접속합니다. `/`, `/worker_ai.html`, `/admin_ai.html`, `/guide.html`이 같은 서버에서 제공되고 분석 요청도 같은 출처의 `/api/weld-predict`로 전송됩니다.

무료 서비스는 일정 시간 요청이 없으면 잠들 수 있어, 첫 접속이나 첫 분석 요청에 지연이 생길 수 있습니다.
