const express = require('express');
const multer = require('multer'); // 파일 업로드 처리
const fs = require('fs-extra'); // 파일 시스템 작업 (압축 해제 등)
const unzipper = require('unzipper'); // ZIP 압축 해제
const { execSync, exec } = require('child_process'); // Git 명령어 실행용
const path = require('path'); // 경로 처리

const app = express();
const port = process.env.UPLOAD_APP_PORT || 3001; // 웹 애플리케이션 포트

// --- 설정 필요한 환경 변수 ---
// 애플리케이션 소스 코드를 푸시할 Git 리포지토리 정보
// 예: https://YOUR_GITHUB_USERNAME:YOUR_APP_REPO_PAT@github.com/YOUR_GITHUB_USERNAME/simple-node-app.git
const APP_REPO_URL = process.env.APP_REPO_URL;
const APP_REPO_BRANCH = process.env.APP_REPO_BRANCH || 'main';
// -----------------------------

const APP_REPO_LOCAL_PATH = path.join(__dirname, 'temp-app-repo'); // 임시 로컬 클론 경로
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// 업로드 파일 저장 설정
fs.ensureDirSync(UPLOADS_DIR); // 업로드 디렉토리 생성
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); // 중복 방지를 위해 타임스탬프 추가
  }
});
const upload = multer({ storage: storage });

app.use(express.static(path.join(__dirname, 'public'))); // 정적 파일(HTML) 제공

// 루트 경로 접속 시 HTML 페이지 제공
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 파일 업로드 처리 라우트
app.post('/upload', upload.single('sourceCodeZip'), async (req, res) => {
  if (!APP_REPO_URL) {
    console.error('Error: APP_REPO_URL environment variable is not set.');
    return res.status(500).send('Server configuration error: APP_REPO_URL is not set.');
  }
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const uploadedFilePath = req.file.path;
  const uploadedFileName = req.file.originalname;
  let operationStatus = `File ${uploadedFileName} uploaded. `;

  try {
    console.log(`Processing ${uploadedFileName} uploaded to ${uploadedFilePath}`);

    // 1. 기존 로컬 리포지토리 삭제 (이전 작업 내용 정리)
    if (fs.existsSync(APP_REPO_LOCAL_PATH)) {
      console.log(`Removing existing local repo at ${APP_REPO_LOCAL_PATH}`);
      fs.removeSync(APP_REPO_LOCAL_PATH);
    }
    fs.ensureDirSync(APP_REPO_LOCAL_PATH);

    // 2. 애플리케이션 Git 리포지토리 클론
    console.log(`Cloning ${APP_REPO_URL} (branch: ${APP_REPO_BRANCH}) to ${APP_REPO_LOCAL_PATH}`);
    execSync(`git clone --branch ${APP_REPO_BRANCH} ${APP_REPO_URL} ${APP_REPO_LOCAL_PATH}`, { stdio: 'inherit' });
    operationStatus += 'Repository cloned. ';

    // 3. 클론된 리포지토리 내 기존 파일 삭제 (필수 파일 제외)
    //    .git 폴더는 유지해야 Git 리포지토리로 동작합니다.
    //    .github 폴더 (워크플로우 정의)도 유지하는 것이 좋습니다.
    console.log('Cleaning up existing files in local repo (excluding .git and .github)...');
    const filesInRepo = fs.readdirSync(APP_REPO_LOCAL_PATH);
    for (const file of filesInRepo) {
      if (file !== '.git' && file !== '.github') { // .gitignore 등 필요한 다른 파일도 제외 목록에 추가 가능
        fs.removeSync(path.join(APP_REPO_LOCAL_PATH, file));
      }
    }
    operationStatus += 'Old files cleaned. ';

    // 4. 업로드된 ZIP 파일 압축 해제하여 리포지토리에 복사
    console.log(`Unzipping ${uploadedFilePath} to ${APP_REPO_LOCAL_PATH}`);
    await fs.createReadStream(uploadedFilePath)
      .pipe(unzipper.Extract({ path: APP_REPO_LOCAL_PATH }))
      .promise();
    console.log('Unzip complete.');
    operationStatus += 'New code unzipped. ';

    // 5. Git 변경사항 커밋 및 푸시
    console.log('Committing and pushing changes...');
    const commitMessage = `CI: Source code update via web upload - ${new Date().toISOString()}`;

    // Git 사용자 정보 설정 (GitHub Actions 봇과 유사하게)
    execSync(`git -C ${APP_REPO_LOCAL_PATH} config user.name "Upload-App Bot"`, { stdio: 'inherit' });
    execSync(`git -C ${APP_REPO_LOCAL_PATH} config user.email "upload-app-bot@example.com"`, { stdio: 'inherit' });

    execSync(`git -C ${APP_REPO_LOCAL_PATH} add .`, { stdio: 'inherit' });

    // 변경 사항이 있을 때만 커밋 및 푸시
    const statusOutput = execSync(`git -C ${APP_REPO_LOCAL_PATH} status --porcelain`).toString();
    if (statusOutput) {
      execSync(`git -C ${APP_REPO_LOCAL_PATH} commit -m "${commitMessage}"`, { stdio: 'inherit' });
      execSync(`git -C ${APP_REPO_LOCAL_PATH} push origin ${APP_REPO_BRANCH}`, { stdio: 'inherit' });
      console.log('Changes pushed to remote repository.');
      operationStatus += 'Changes committed and pushed. CI/CD pipeline triggered.';
      res.send(operationStatus);
    } else {
      console.log("No changes to commit.");
      operationStatus += 'No changes detected to push.';
      res.send(operationStatus);
    }

  } catch (error) {
    console.error('Error processing file:', error);
    let errorMessage = 'Error processing file. ';
    if (error.message) errorMessage += error.message + ' ';
    if (error.stderr) errorMessage += 'STDERR: ' + error.stderr.toString();
    if (error.stdout) errorMessage += 'STDOUT: ' + error.stdout.toString();
    res.status(500).send(errorMessage);
  } finally {
    // 임시 업로드 파일 삭제
    if (fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath);
    }
  }
});

app.listen(port, () => {
  console.log(`Upload server listening at http://localhost:${port}`);
  if (!APP_REPO_URL) {
    console.warn('CRITICAL WARNING: APP_REPO_URL environment variable is NOT SET. Git operations will FAIL.');
  } else {
    console.log(`Configured to push to: ${APP_REPO_URL.replace(/:[^@]*@/, ':****@')} on branch ${APP_REPO_BRANCH}`);
  }
});