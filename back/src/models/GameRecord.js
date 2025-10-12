const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('GameRecord', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            field: 'record_id'  // DB는 record_id, 코드에서는 id
        },
        roomId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'room_id'  // DB는 room_id, 코드에서는 roomId
        },
        winnerId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'winner_id'  // DB는 winner_id, 코드에서는 winnerId
        },
        loserId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'loser_id'  // DB는 loser_id, 코드에서는 loserId
        },
        playedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            field: 'played_at'  // DB는 played_at, 코드에서는 playedAt
        }
    }, {
        tableName: 'Game_Record',
        timestamps: false
    });
};