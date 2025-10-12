const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('RoomParticipant', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            field: 'participant_id'  // DB는 participant_id, 코드에서는 id
        },
        roomId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'room_id'  // DB는 room_id, 코드에서는 roomId
        },
        memberId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'member_id'  // DB는 member_id, 코드에서는 memberId
        },
        joinedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            field: 'joined_at'  // DB는 joined_at, 코드에서는 joinedAt
        }
    }, {
        tableName: 'Room_Participant',
        timestamps: false,
        indexes: [
            {
                unique: true,
                fields: ['room_id', 'member_id']  // 중복 참가 방지
            }
        ]
    });
};