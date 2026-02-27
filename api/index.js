const app = require("../server");
const connectDB = require("../config/db");

module.exports = async (req, res) => {
    await connectDB();
    return app(req, res);
};