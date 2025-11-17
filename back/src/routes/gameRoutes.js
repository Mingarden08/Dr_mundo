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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roomName
 *             properties:
 *               roomName:
 *                 type: string
 *                 example: "Dr. Mundo의 방"
 *     responses:
 *       200:
 *         description: 방 생성 성공 (새로 생성된 방 ID를 반환해야 함)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "방이 성공적으로 생성되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     roomId:
 *                       type: integer
 *                       example: 123
 *                     playerCnt:
 *                       type: integer
 *                       example: 1
 */
router.post("/dr-mundo/game/room/create", authMiddleware, gameCtrl.createRoom);

/**
 * @swagger
 * /dr-mundo/game/room:
 *   get:
 *     summary: 대기 중인 방 목록 조회
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
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
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "요청이 성공적으로 처리되었습니다."
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
router.get("/dr-mundo/game/room", authMiddleware, gameCtrl.getRoomList);

/**
 * @swagger
 * /dr-mundo/game/room/join/{rNo}:
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
 *         description: 방 참가 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "요청이 성공적으로 처리되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 */
router.post("/dr-mundo/game/room/join/:rNo", authMiddleware, gameCtrl.joinRoom);

/**
 * @swagger
 * /dr-mundo/game/room/start/{rNo}:
 *   post:
 *     summary: 게임 시작
 *     description: 방장이 게임을 시작할 때 DB 상태를 'playing'으로 변경 (웹소켓 연결 전 사용)
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "요청이 성공적으로 처리되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 */
router.post('/dr-mundo/game/room/start/:rNo', authMiddleware, gameCtrl.startGame);

/**
 * @swagger
 * /dr-mundo/game/room/leave/{rNo}:
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "요청이 성공적으로 처리되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 */
router.delete('/dr-mundo/game/room/leave/:rNo', authMiddleware, gameCtrl.leaveRoom);

/**
 * @swagger
 * /dr-mundo/game/room/{rNo}:
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "요청이 성공적으로 처리되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 */
router.delete("/dr-mundo/game/room/:rNo", authMiddleware, gameCtrl.deleteRoom);

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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "요청이 성공적으로 처리되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     games:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           win:
 *                             type: boolean
 *                             example: true
 *                           enemy:
 *                             type: string
 *                             example: "nickName"
 *                           rank:
 *                             type: integer
 *                             example: 1
 */
router.get("/dr-mundo/game/record", authMiddleware, gameCtrl.getGameRecord);

/**
 * @swagger
 * /dr-mundo/game/ranking:
 *   get:
 *     summary: 전체 랭킹 조회
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 랭킹 목록 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "요청이 성공적으로 처리되었습니다."
 *                 data:
 *                   type: object
 *                   properties:
 *                     ranks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           winRate:
 *                             type: integer
 *                             example: 10
 *                           player:
 *                             type: string
 *                             example: "nickName"
 */
router.get('/dr-mundo/game/ranking', authMiddleware, gameCtrl.getRanking);

router.get("/dr-mundo/game/room/start/:rNo", (req, res) => {
    res.status(200).json({ status: 'Start GET Route Working', rNo: req.params.rNo });
});

module.exports = router;