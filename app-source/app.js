const express = require('express');
const cookieParser = require('cookie-parser'); // csurf를 위해 추가
const csrf = require('csurf'); // csurf 추가
const app = express();
const port = process.env.PORT || 3000;

// csurf는 세션 미들웨어나 cookie-parser 뒤에 와야 합니다.
app.use(cookieParser());
const csrfProtection = csrf({ cookie: true }); // CSRF 보호 설정
app.use(csrfProtection); // 모든 라우트에 CSRF 보호 적용 (또는 특정 라우트에만 적용)

app.get('/', (req, res) => {
  const currentTime = new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' });
  // 폼을 사용하는 경우, CSRF 토큰을 템플릿에 전달해야 합니다.
  // 예: res.render('index', { csrfToken: req.csrfToken() });
  res.send(`
    <h1>안녕하세요! CI/CD 테스트 앱입니다. (v1)</h1>
    <p>현재 서버 시간 (KST): ${currentTime}</p>
    <p>이 메시지가 보인다면 성공적으로 배포된 것입니다!</p>
    <p>CSRF Token (테스트용): ${req.csrfToken()}</p> 
  `);
});

// POST 요청 등 상태를 변경하는 요청에 대한 CSRF 토큰 검증이 필요합니다.
// GET 요청만 있는 간단한 예제에서는 csurf 미들웨어 추가만으로도 Semgrep 규칙을 통과할 수 있습니다.

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// 오류 처리 미들웨어 (csurf 오류 처리)
app.use((err, req, res, next) => {
  if (err.code !== 'EBADCSRFTOKEN') return next(err);
  // CSRF 토큰 오류 처리
  res.status(403).send('CSRF token validation failed');
});

app.listen(port, () => {
  console.log(`Sample app listening at http://localhost:${port}`);
});