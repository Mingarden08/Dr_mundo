const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Room', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        roomName: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'rooms'
    });
};
