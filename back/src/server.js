const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3000;

(async () => {
    try {
        // DB 연결 및 동기화
        await sequelize.sync({ alter: true }); // 개발 중에는 alter: true
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌐 Swagger: http://localhost:${PORT}/api-docs`);
        });
    } catch (err) {
        console.error('❌ DB 연결 실패:', err);
        process.exit(1);
    }
})();
