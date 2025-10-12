const sequelize = require('../utils/db');
const User = require('./User');
const Room = require('./Room');
const RoomPlayer = require('./RoomPlayer');

const models = {
    User: User(sequelize),
    Room: Room(sequelize),
    RoomPlayer: RoomPlayer(sequelize)
};

// 관계 설정
models.Room.hasMany(models.RoomPlayer, { foreignKey: 'roomId', as: 'players' });
models.RoomPlayer.belongsTo(models.Room, { foreignKey: 'roomId' });

models.User.hasMany(models.RoomPlayer, { foreignKey: 'userId', as: 'roomEntries' });
models.RoomPlayer.belongsTo(models.User, { foreignKey: 'userId' });

module.exports = { sequelize, ...models };
