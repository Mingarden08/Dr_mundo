const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// 라우터 모듈
const memberRoutes = require('./routes/memberRoutes');
const gameRouter = require('./routes/gameRoutes');

// Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swagger');

const app = express();

// ✅ 기본 미들웨어
app.use(cors({
    origin: ['https://dr-mundo.onrender.com', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

// ✅ 정적 파일 서빙 (예: 이미지, CSS 등)
app.use(express.static(path.join(__dirname, 'public')));

// ✅ 라우터 등록
app.use('/', memberRoutes);
app.use('/', gameRouter);

// ✅ React build 폴더 서빙
app.use(express.static(path.join(__dirname, '../../front/build')));

// ✅ Swagger 문서
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ✅ 헬스 체크용 라우트
app.get('/health', (req, res) => {
    res.json({
        code: 200,
        message: '요청이 성공적으로 처리되었습니다.',
        data: { status: 'ok' },
    });
});

// ✅ SPA 라우팅 처리 (React Router 지원)
app.get(/^(?!\/api|\/dr-mundo).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, '../../front/build', 'index.html'));
});

// ✅ 404 처리 (선택 사항)
app.use((req, res, next) => {
    res.status(404).send('Sorry, cant find that!');
});

module.exports = app;