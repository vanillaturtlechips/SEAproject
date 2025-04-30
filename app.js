const http = require('http');

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
  res.end('Hello World!\n');
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`서버가 포트 ${port}에서 실행 중입니다.`);
});