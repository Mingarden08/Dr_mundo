const express = require('express');
const router = express.Router();
const roomCtrl = require('../controllers/roomController');
const { authMiddleware } = require('../middlewares/auth');

/**
 * @swagger
 * /dr-mundo/game/room/create:
 *   post:
 *     summary: 방 생성 (Create Room)
 *     tags: [Room]
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
 *                 example: "My Awesome Room"
 *     responses:
 *       200:
 *         description: 방 생성 성공 (Room created successfully)
 */
router.post('/dr-mundo/game/room/create', authMiddleware, roomCtrl.createRoom);

/**
 * @swagger
 * /dr-mundo/game/room:
 *   get:
 *     summary: 방 목록 조회
 *     tags: [Room]
 *     responses:
 *       200:
 *         description: 방 목록 조회 성공
 */
router.get('/dr-mundo/game/room', roomCtrl.listRooms);

/**
 * @swagger
 * /dr-mundo/game/room/join/{rNo}:
 *   post:
 *     summary: 방 참가
 *     tags: [Room]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rNo
 *         required: true
 *         schema:
 *           type: integer
 *         description: 방 번호
 *         example: 1
 *     responses:
 *       200:
 *         description: 방 참가 성공
 */
router.post('/dr-mundo/game/room/join/:rNo', authMiddleware, roomCtrl.joinRoom);

module.exports = router;
