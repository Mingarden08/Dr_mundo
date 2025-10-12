const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('RoomPlayer', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        roomId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: true
        }
    }, {
        tableName: 'room_players'
    });
};
