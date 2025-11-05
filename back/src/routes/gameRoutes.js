const express = require("express");

const router = express.Router();

const gameCtrl = require("../controllers/gameController");

const { authMiddleware } = require("../middlewares/auth");



/**

 * @swagger

 * /dr-mundo/game/room/create:

 *   post:

 *     summary: 게임 방 생성

 *     tags: [Game]

 *     security:

 *       - bearerAuth: []

 *     responses:

 *       200:

 *         description: 방 생성 성공

 */

router.post("/dr-mundo/game/room/create", authMiddleware, gameCtrl.createRoom);



/**

 * @swagger

 * /dr-mundo/game/room/list:

 *   get:

 *     summary: 대기 중인 방 목록 조회

 *     tags: [Game]

 *     responses:

 *       200:

 *         description: 방 목록 반환

 *         content:

 *           application/json:

 *             schema:

 *               type: object

 *               properties:

 *                 code:

 *                   type: integer

 *                 message:

 *                   type: string

 *                 data:

 *                   type: object

 *                   properties:

 *                     rooms:

 *                       type: array

 *                       items:

 *                         type: object

 *                         properties:

 *                           roomId:

 *                             type: integer

 *                             example: 3

 *                           playerCnt:

 *                             type: integer

 *                             example: 2

 */

router.get("/dr-mundo/game/room/list", gameCtrl.getRoomList);



/**

 * @swagger

 * /dr-mundo/game/room/{rNo}/join:

 *   post:

 *     summary: 방 참가

 *     tags: [Game]

 *     security:

 *       - bearerAuth: []

 *     parameters:

 *       - in: path

 *         name: rNo

 *         required: true

 *         schema:

 *           type: integer

 *         description: 방 번호

 *     responses:

 *       200:

 *         description: 참가 성공

 */

router.post("/dr-mundo/game/room/:rNo/join", authMiddleware, gameCtrl.joinRoom);



/**

 * @swagger

 * /dr-mundo/game/room/{rNo}/start:

 *   post:

 *     summary: 게임 시작

 *     tags: [Game]

 *     security:

 *       - bearerAuth: []

 *     parameters:

 *       - in: path

 *         name: rNo

 *         required: true

 *         schema:

 *           type: integer

 *         description: 방 번호

 *     responses:

 *       200:

 *         description: 게임 시작 성공

 */

router.post("/dr-mundo/game/room/start/:rNo", authMiddleware, gameCtrl.startGame);



/**

 * @swagger

 * /dr-mundo/game/room/{rNo}/leave:

 *   delete:

 *     summary: 방 나가기

 *     tags: [Game]

 *     security:

 *       - bearerAuth: []

 *     parameters:

 *       - in: path

 *         name: rNo

 *         required: true

 *         schema:

 *           type: integer

 *         description: 방 번호

 *     responses:

 *       200:

 *         description: 성공적으로 방을 나감

 */

router.delete("/dr-mundo/game/room/:rNo/leave", authMiddleware, gameCtrl.leaveRoom);



/**

 * @swagger

 * /dr-mundo/game/room/{rNo}/delete:

 *   delete:

 *     summary: 방 삭제 (방장 전용)

 *     tags: [Game]

 *     security:

 *       - bearerAuth: []

 *     parameters:

 *       - in: path

 *         name: rNo

 *         required: true

 *         schema:

 *           type: integer

 *         description: 방 번호

 *     responses:

 *       200:

 *         description: 방 삭제 성공

 */

router.delete("/dr-mundo/game/room/:rNo/delete", authMiddleware, gameCtrl.deleteRoom);



/**

 * @swagger

 * /dr-mundo/game/{rNo}/result:

 *   post:

 *     summary: 게임 결과 저장

 *     tags: [Game]

 *     security:

 *       - bearerAuth: []

 *     parameters:

 *       - in: path

 *         name: rNo

 *         required: true

 *         schema:

 *           type: integer

 *         description: 방 번호

 *     requestBody:

 *       required: true

 *       content:

 *         application/json:

 *           schema:

 *             type: object

 *             properties:

 *               winner:

 *                 type: string

 *                 example: "player"

 *     responses:

 *       200:

 *         description: 결과 저장 성공

 */

router.post("/dr-mundo/game/:rNo/result", authMiddleware, gameCtrl.saveGameResult);



/**

 * @swagger

 * /dr-mundo/game/record:

 *   get:

 *     summary: 전적 조회

 *     tags: [Game]

 *     security:

 *       - bearerAuth: []

 *     responses:

 *       200:

 *         description: 사용자 전적 반환

 */

router.get("/dr-mundo/game/record", authMiddleware, gameCtrl.getGameRecord);



/**

 * @swagger

 * /dr-mundo/game/ranking:

 *   get:

 *     summary: 전체 랭킹 조회

 *     tags: [Game]

 *     responses:

 *       200:

 *         description: 랭킹 목록 반환

 */

router.get("/dr-mundo/game/ranking", gameCtrl.getRanking);

// D:\Dr_mundo\back\src\routes\gameRoutes.js 파일 하단에 추가

router.get('/dr-mundo/test-start', (req, res) => {
    // 이 경로가 POST 대신 GET으로 정의되어 있어 브라우저에서 바로 테스트 가능
    res.status(200).json({ status: 'Route Working', route: '/dr-mundo/test-start' });
});

// 실제 문제가 된 라우트 경로의 GET 버전도 테스트 해봅시다.
router.get("/dr-mundo/game/room/start/:rNo", (req, res) => {
    res.status(200).json({ status: 'Start GET Route Working', rNo: req.params.rNo });
});

module.exports = router;