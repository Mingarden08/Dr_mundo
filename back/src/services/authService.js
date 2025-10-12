const bcrypt = require("bcrypt");
const User = require("../models/User"); // Sequelize User 모델
const { generateToken } = require("../config/jwt");

exports.register = async (usermail, username, password) => {
    const existingUser = await User.findOne({ where: { usermail } });
    if (existingUser) throw new Error("이미 사용 중인 이메일입니다.");

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ usermail, username, password: hashed });

    return user;
};

exports.login = async (usermail, password) => {
    const user = await User.findOne({ where: { usermail } });
    if (!user) throw new Error("사용자를 찾을 수 없습니다.");

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error("비밀번호가 틀렸습니다.");

    // JWT 발급
    const token = generateToken({ id: user.id, usermail: user.usermail });

    return { user, token };
};
