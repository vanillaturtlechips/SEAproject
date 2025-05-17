const express = require('express');
const multer = require('multer'); // 파일 업로드 처리
const fs = require('fs-extra'); // 파일 시스템 작업 (디렉토리 생성, 삭제 등)
const unzipper = require('unzipper'); // ZIP 압축 해제
const { execSync } = require('child_process'); // Git 명령어 실행용
const path = require('path'); // 경로 처리

const app = express();
const port = process.env.UPLOAD_APP_PORT || 3001; // 웹 애플리케이션 포트

// --- 설정 필요한 환경 변수 ---
// 애플리케이션 소스 코드를 푸시할 Git 리포지토리 정보
// 예: https://YOUR_GITHUB_USERNAME:YOUR_APP_REPO_PAT@github.com/YOUR_GITHUB_USERNAME/YOUR_SINGLE_REPO_NAME.git
const APP_REPO_URL = process.env.APP_REPO_URL; // 예: vanillaturtlechips/SEAproject
const APP_REPO_BRANCH = process.env.APP_REPO_BRANCH || 'main';

// ★ 애플리케이션 소스 코드가 위치할 리포지토리 내 하위 디렉토리 이름
const APP_SOURCE_SUBDIR = process.env.APP_SOURCE_SUBDIR || 'app-source';
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

app.use(express.static(path.join(__dirname, 'public'))); // 정적 파일(HTML) 제공 (public 폴더 필요)

// 루트 경로 접속 시 HTML 페이지 제공
app.get('/', (req, res) => {
  // public/index.html 파일이 있다고 가정
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

  // 업로드된 소스 코드가 저장될 전체 로컬 경로
  const appSourceFullPathInLocalClone = path.join(APP_REPO_LOCAL_PATH, APP_SOURCE_SUBDIR);

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

    // 3. 클론된 리포지토리 내 APP_SOURCE_SUBDIR 디렉토리 생성 및 기존 내용 정리
    //    이 디렉토리 내부의 파일/폴더만 삭제합니다.
    console.log(`Ensuring and cleaning up target directory: ${appSourceFullPathInLocalClone}`);
    fs.ensureDirSync(appSourceFullPathInLocalClone); // APP_SOURCE_SUBDIR 디렉토리 존재 확인 및 생성

    const filesInAppSourceDir = fs.readdirSync(appSourceFullPathInLocalClone);
    for (const file of filesInAppSourceDir) {
        // APP_SOURCE_SUBDIR 내부에 특별히 보존할 파일/폴더가 있다면 여기에 예외 조건 추가 가능
        fs.removeSync(path.join(appSourceFullPathInLocalClone, file));
    }
    operationStatus += `Cleaned up target directory ./${APP_SOURCE_SUBDIR}. `;

    // 4. 업로드된 ZIP 파일 압축 해제하여 APP_SOURCE_SUBDIR 에 복사
    console.log(`Unzipping ${uploadedFilePath} to ${appSourceFullPathInLocalClone}`);
    await fs.createReadStream(uploadedFilePath)
      .pipe(unzipper.Extract({ path: appSourceFullPathInLocalClone })) // 압축 해제 경로를 하위 디렉토리로 지정
      .promise();
    console.log('Unzip complete.');
    operationStatus += `New code unzipped into ./${APP_SOURCE_SUBDIR}. `;

    // 5. Git 변경사항 커밋 및 푸시
    console.log('Committing and pushing changes...');
    const commitMessage = `CI: Update application source in ${APP_SOURCE_SUBDIR} via web upload - ${new Date().toISOString()}`;

    // Git 사용자 정보 설정
    execSync(`git -C ${APP_REPO_LOCAL_PATH} config user.name "Upload-App Bot"`, { stdio: 'inherit' });
    execSync(`git -C ${APP_REPO_LOCAL_PATH} config user.email "upload-app-bot@example.com"`, { stdio: 'inherit' });

    // APP_SOURCE_SUBDIR 디렉토리만 또는 전체 리포지토리를 add 할지 결정할 수 있습니다.
    // 여기서는 리포지토리 전체 변경사항을 add 합니다 (예: APP_SOURCE_SUBDIR 내 파일 변경 + 다른 변경사항이 있다면 함께)
    // 만약 APP_SOURCE_SUBDIR 내의 변경만 커밋하고 싶다면 `git -C ${APP_REPO_LOCAL_PATH} add ${APP_SOURCE_SUBDIR}` 사용
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
    if (error.stdout) errorMessage += 'STDOUT: ' + error.stdout.toString(); // stdout도 에러 진단에 도움이 될 수 있음
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
    // PAT 부분 마스킹 개선 (URL에 사용자 정보가 없을 수도 있음을 고려)
    let displayUrl = APP_REPO_URL;
    try {
        const urlObj = new URL(APP_REPO_URL);
        if (urlObj.password) {
            urlObj.password = '****';
        }
        if (urlObj.username && urlObj.protocol === 'https:') { // https 에서만 사용자명 표시 (ssh는 다름)
             // 이미 username:password@ 형태이므로, username 만 표시하거나, username도 가릴 수 있음
        }
        displayUrl = urlObj.toString();
    } catch(e) {
        // URL 파싱 실패 시 원본 표시 (혹은 일부 마스킹)
        displayUrl = APP_REPO_URL.replace(/:[^@]*@/, ':****@');
    }
    console.log(`Configured to push to: ${displayUrl} on branch ${APP_REPO_BRANCH}`);
    console.log(`Application source will be placed in subdirectory: ./${APP_SOURCE_SUBDIR}`);
  }
});