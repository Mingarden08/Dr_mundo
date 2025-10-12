const bcrypt = require("bcrypt");
const { User } = require("../models");
const { logoutToken } = require("../middlewares/auth");
const { generateToken } = require("../utils/jwt");

const saltRounds = 10;

const successResp = (data) => ({ code: 200, message: "요청이 성공적으로 처리되었습니다.", data });

exports.signup = async (req, res) => {
    try {
        const { nickName, passwd, email } = req.body;
        if (!nickName || !passwd || !email) {
            return res.status(400).json({ code: 400, message: "필수 값이 없습니다.", data: null });
        }

        const existing = await User.findOne({ where: { email } });
        if (existing) {
            return res.status(409).json({ code: 409, message: "이미 존재하는 이메일입니다.", data: null });
        }

        const hash = await bcrypt.hash(passwd, saltRounds);
        await User.create({ nickName, passwd: hash, email });

        return res.json(successResp({ success: true }));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 500, message: "서버 에러", data: null });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, passwd } = req.body;
        if (!email || !passwd) {
            return res.status(400).json({ code: 400, message: "필수 값이 없습니다.", data: null });
        }

        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(401).json({ code: 401, message: "사용자 없음", data: null });

        const match = await bcrypt.compare(passwd, user.passwd);
        if (!match) return res.status(401).json({ code: 401, message: "비밀번호 불일치", data: null });

        const payload = { id: user.id, email: user.email, nickName: user.nickName };
        const token = generateToken(payload);

        return res.json(successResp({ token }));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 500, message: "서버 에러", data: null });
    }
};

exports.logout = async (req, res) => {
    try {
        const header = req.headers["authorization"];
        if (header) {
            const token = header.split(" ")[1];
            if (token) logoutToken(token);
        }
        return res.json(successResp({ success: true }));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ code: 500, message: "서버 에러", data: null });
    }
};
