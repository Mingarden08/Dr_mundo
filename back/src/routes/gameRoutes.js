const express = require('express');
const router = express.Router();
const gameCtrl = require('../controllers/gameController');
const { authMiddleware } = require('../middlewares/auth');

/**
 * @swagger
 * /dr-mundo/game/room/create:
 *   post:
 *     summary: 방 만들기
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
 *                 example: "문도방"
 *     responses:
 *       200:
 *         description: 방 생성 성공
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
 *                     playerCnt:
 *                       type: integer
 *                       example: 1
 *                     roomId:
 *                       type: integer
 *                       example: 1
 */
router.post('/dr-mundo/game/room/create', authMiddleware, gameCtrl.createRoom);

/**
 * @swagger
 * /dr-mundo/game/room:
 *   get:
 *     summary: 방 목록 보기
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 방 목록 조회 성공
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
 *                           playerCnt:
 *                             type: integer
 *                             example: 1
 *                           roomId:
 *                             type: integer
 *                             example: 1
 */
router.get('/dr-mundo/game/room', authMiddleware, gameCtrl.getRoomList);

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
router.post('/dr-mundo/game/room/join/:rNo', authMiddleware, gameCtrl.joinRoom);

/**
 * @swagger
 * /dr-mundo/game/result/{rNo}:
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
 *             required:
 *               - winner
 *             properties:
 *               winner:
 *                 type: string
 *                 example: "player"
 *     responses:
 *       200:
 *         description: 게임 결과 저장 성공
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
router.post('/dr-mundo/game/result/:rNo', authMiddleware, gameCtrl.saveGameResult);

/**
 * @swagger
 * /dr-mundo/game/record:
 *   get:
 *     summary: 전적 보기
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 전적 조회 성공
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
 *                     rank:
 *                       type: integer
 *                       example: 1
 */
router.get('/dr-mundo/game/record', authMiddleware, gameCtrl.getGameRecord);

/**
 * @swagger
 * /dr-mundo/game/rank:
 *   get:
 *     summary: 랭킹 보기
 *     tags: [Game]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 랭킹 조회 성공
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
router.get('/dr-mundo/game/rank', authMiddleware, gameCtrl.getRanking);

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
 *         description: 방 나가기 성공
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
 *     summary: 방 삭제 (방장만 가능)
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
router.delete('/dr-mundo/game/room/:rNo', authMiddleware, gameCtrl.deleteRoom);

module.exports = router;