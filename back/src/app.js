const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const memberRoutes = require('./routes/memberRoutes');
// const gameRoutes = require('./routes/gameRoutes'); // ❌ gameRoutes 모듈 로드 제거됨
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swagger');

// Game 라우트에서 필요한 모듈을 app.js에서 직접 로드
const gameCtrl = require("./controllers/gameController");
const { authMiddleware } = require("./middlewares/auth"); 

const app = express();
const gameRouter = express.Router(); // 👈 Game Routes 등록을 위한 새로운 Router 객체 생성

app.use(express.static(path.join(__dirname, 'public')));

// 기본 미들웨어

// 🚀 CORS 설정 수정: 로컬 개발 환경의 출처 (http://localhost:3001)를 허용 목록에 추가합니다.
app.use(cors({
    // Render 배포 주소와 로컬 개발 주소를 모두 허용
    origin: ['https://dr-mundo.onrender.com', 'http://localhost:3001'], 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

// Member 라우트 등록
app.use('/', memberRoutes);

// *******************************************************************
// 🚨 Game Routes 직접 등록 (라우팅 로드 오류 우회) 🚨
// *******************************************************************

/**
 * @swagger
 * /dr-mundo/game/room/create:
 * post:
 * summary: 게임 방 생성
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * required:
 * - roomName
 * properties:
 * roomName:
 * type: string
 * example: "Dr. Mundo의 방"
 * responses:
 * 200:
 * description: 방 생성 성공 (새로 생성된 방 ID를 반환해야 함)
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * code:
 * type: integer
 * example: 200
 * message:
 * type: string
 * example: "방이 성공적으로 생성되었습니다."
 * data:
 * type: object
 * properties:
 * roomId:
 * type: integer
 * example: 123
 */
gameRouter.post("/dr-mundo/game/room/create", authMiddleware, gameCtrl.createRoom);

/**
 * @swagger
 * /dr-mundo/game/room:
 * get:
 * summary: 대기 중인 방 목록 조회
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: 방 목록 반환
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * code:
 * type: integer
 * example: 200
 * message:
 * type: string
 * example: "요청이 성공적으로 처리되었습니다."
 * data:
 * type: object
 * properties:
 * rooms:
 * type: array
 * items:
 * type: object
 * properties:
 * roomId:
 * type: integer
 * example: 3
 * playerCnt:
 * type: integer
 * example: 2
 */
gameRouter.get("/dr-mundo/game/room", gameCtrl.getRoomList);

/**
 * @swagger
 * /dr-mundo/game/room/{rNo}/join:
 * post:
 * summary: 방 참가
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: rNo
 * required: true
 * schema:
 * type: integer
 * description: 방 번호
 * responses:
 * 200:
 * description: 참가 성공
 */
gameRouter.post("/dr-mundo/game/room/:rNo/join", authMiddleware, gameCtrl.joinRoom);

/**
 * @swagger
 * /dr-mundo/game/room/start/{rNo}:
 * post:
 * summary: 게임 시작
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: rNo
 * required: true
 * schema:
 * type: integer
 * description: 방 번호
 * responses:
 * 200:
 * description: 게임 시작 성공
 */
gameRouter.post("/dr-mundo/game/room/start/:rNo", authMiddleware, gameCtrl.startGame);

/**
 * @swagger
 * /dr-mundo/game/room/{rNo}/leave:
 * delete:
 * summary: 방 나가기
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: rNo
 * required: true
 * schema:
 * type: integer
 * description: 방 번호
 * responses:
 * 200:
 * description: 성공적으로 방을 나감
 */
gameRouter.delete("/dr-mundo/game/room/:rNo/leave", authMiddleware, gameCtrl.leaveRoom);

/**
 * @swagger
 * /dr-mundo/game/room/{rNo}/delete:
 * delete:
 * summary: 방 삭제 (방장 전용)
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: rNo
 * required: true
 * schema:
 * type: integer
 * description: 방 번호
 * responses:
 * 200:
 * description: 방 삭제 성공
 */
gameRouter.delete("/dr-mundo/game/room/:rNo/delete", authMiddleware, gameCtrl.deleteRoom);

/**
 * @swagger
 * /dr-mundo/game/{rNo}/result:
 * post:
 * summary: 게임 결과 저장
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * parameters:
 * - in: path
 * name: rNo
 * required: true
 * schema:
 * type: integer
 * description: 방 번호
 * requestBody:
 * required: true
 * content:
 * application/json:
 * schema:
 * type: object
 * properties:
 * winner:
 * type: string
 * example: "player"
 * responses:
 * 200:
 * description: 결과 저장 성공
 */
gameRouter.post("/dr-mundo/game/:rNo/result", authMiddleware, gameCtrl.saveGameResult);

/**
 * @swagger
 * /dr-mundo/game/record:
 * get:
 * summary: 전적 조회
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: 사용자 전적 반환
 */
gameRouter.get("/dr-mundo/game/record", authMiddleware, gameCtrl.getGameRecord);

/**
 * @swagger
 * /dr-mundo/game/ranking:
 * get:
 * summary: 전체 랭킹 조회
 * tags: [Game]
 * security:
 * - bearerAuth: []
 * responses:
 * 200:
 * description: 랭킹 목록 반환
 */
gameRouter.get("/dr-mundo/game/ranking", gameCtrl.getRanking);

// 라우팅 인식 테스트용 라우트
gameRouter.get('/dr-mundo/test-start', (req, res) => {
    res.status(200).json({ status: 'Route Working', route: '/dr-mundo/test-start' });
});


// 최종적으로 app에 gameRouter를 연결
app.use('/', gameRouter); 
// *******************************************************************

// ✅ React build 폴더 서빙
app.use(express.static(path.join(__dirname, '../../front/build')));

// ✅ SPA 라우팅 처리
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../front/build', 'index.html'));
});


// Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 헬스 체크용 기본 라우트 (정적 파일 충돌 방지를 위해 경로를 /health로 변경)
app.get('/health', (req, res) => {
    res.json({
        code: 200,
        message: '요청이 성공적으로 처리되었습니다.',
        data: { status: 'ok' },
    });
});

// 모든 라우트가 처리되지 못한 경우 404 처리 (선택 사항)
app.use((req, res, next) => {
    res.status(404).send('Sorry cant find that!');
});


module.exports = app;