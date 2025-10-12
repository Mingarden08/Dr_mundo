const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Room', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            field: 'room_id'  // DB는 room_id, 코드에서는 id
        },
        roomName: {
            type: DataTypes.STRING(100),
            allowNull: false,
            field: 'room_name'  // DB는 room_name, 코드에서는 roomName
        },
        hostId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'host_id'  // DB는 host_id, 코드에서는 hostId
        },
        playerCount: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
            field: 'player_count'  // DB는 player_count, 코드에서는 playerCount
        },
        maxCount: {
            type: DataTypes.INTEGER,
            defaultValue: 2,
            field: 'max_count'  // DB는 max_count, 코드에서는 maxCount
        },
        status: {
            type: DataTypes.STRING(20),
            defaultValue: 'waiting'
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            field: 'createed_at'  // DB 오타 그대로 유지
        }
    }, {
        tableName: 'Room',
        timestamps: false
    });
};