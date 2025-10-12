const express = require('express');
const router = express.Router();
const memberCtrl = require('../controllers/memberController');
const { authMiddleware } = require('../middlewares/auth');

/**
 * @swagger
 * /dr-mundo/member/signup:
 *   post:
 *     summary: 회원가입
 *     tags: [Member]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nickName
 *               - passwd
 *               - email
 *             properties:
 *               nickName:
 *                 type: string
 *                 example: "string"
 *               passwd:
 *                 type: string
 *                 example: "string"
 *               email:
 *                 type: string
 *                 example: "test@example.com"
 *     responses:
 *       200:
 *         description: 회원가입 성공
 */
router.post('/dr-mundo/member/signup', memberCtrl.signup);

/**
 * @swagger
 * /dr-mundo/member/login:
 *   post:
 *     summary: 로그인
 *     tags: [Member]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - passwd
 *             properties:
 *               email:
 *                 type: string
 *                 example: "test@example.com"
 *               passwd:
 *                 type: string
 *                 example: "string"
 *     responses:
 *       200:
 *         description: 로그인 성공
 */
router.post('/dr-mundo/member/login', memberCtrl.login);

/**
 * @swagger
 * /dr-mundo/member/logout:
 *   delete:
 *     summary: 로그아웃
 *     tags: [Member]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 */
router.delete('/dr-mundo/member/logout', authMiddleware, memberCtrl.logout);

module.exports = router;
