const swaggerJSDoc = require("swagger-jsdoc");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "DR_MUNDO API",
            version: "1.0.0",
            description: "DR_MUNDO game & member APIs",
        },
        servers: [
            {
                url: "https://dr-mundo.onrender.com",
                description: "Local server",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: ["./src/routes/*.js"], // 라우트에 주석 추가
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
