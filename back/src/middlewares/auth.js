const { verifyToken } = require("../utils/jwt");

const tokenBlacklist = new Set();

const authMiddleware = (req, res, next) => {
    try {
        const header = req.headers["authorization"];
        if (!header) {
            return res.status(401).json({ code: 401, message: "토큰이 없습니다.", data: null });
        }

        const token = header.split(" ")[1];
        if (!token) {
            return res.status(401).json({ code: 401, message: "토큰 형식이 올바르지 않습니다.", data: null });
        }

        if (tokenBlacklist.has(token)) {
            return res.status(401).json({ code: 401, message: "로그아웃된 토큰입니다.", data: null });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ code: 401, message: "유효하지 않은 토큰입니다.", data: null });
        }

        req.user = decoded; // 인증된 사용자 정보 주입
        next();
    } catch (err) {
        return res.status(401).json({ code: 401, message: "인증 실패", data: null });
    }
};

const logoutToken = (token) => {
    tokenBlacklist.add(token);
};

module.exports = {
    authMiddleware,
    logoutToken,
};
