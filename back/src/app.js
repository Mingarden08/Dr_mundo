const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const memberRoutes = require('./routes/memberRoutes');
const gmaeRoutes = require('./routes/gameRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swagger');

const app = express();

// 기본 미들웨어
// CORS 설정
app.use(cors({
    origin: ['https://dr-mundo.onrender.com'], // 허용할 도메인
    methods: ['GET','POST','PUT','DELETE'],
    credentials: true // 쿠키 사용 시 필요
}));
app.use(express.json());
app.use(morgan('dev'));


// 라우트 등록
app.use(memberRoutes);
app.use(gmaeRoutes);

// Swagger 문서 경로 설정
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 헬스 체크용 기본 라우트
app.get('/', (req, res) => {
    res.json({
        code: 200,
        message: '요청이 성공적으로 처리되었습니다.',
        data: { status: 'ok' },
    });
});

module.exports = app;
