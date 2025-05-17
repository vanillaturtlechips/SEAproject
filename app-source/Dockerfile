# 1. Node.js LTS 버전의 slim 이미지를 기반으로 합니다.
FROM node:18-slim

# 2. 컨테이너 내 작업 디렉토리 설정
WORKDIR /usr/src/app

# 3. 애플리케이션 의존성 설치
# package.json과 package-lock.json(있다면)을 먼저 복사하여 Docker 빌드 캐시를 활용합니다.
COPY package*.json ./
RUN npm install --omit=dev
# 운영 환경에서는 개발 의존성은 제외하는 것이 좋습니다.

# 4. 애플리케이션 소스 코드 복사
COPY . .

# 5. 애플리케이션이 사용할 포트 명시 (실제 실행은 app.js에서 process.env.PORT 또는 3000 사용)
EXPOSE 3000

# 6. 컨테이너 시작 시 실행될 명령어
CMD [ "node", "app.js" ]