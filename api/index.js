const app = require("../server");
const connectDB = require("../config/db");

module.exports = async (req, res) => {
    try {
        await connectDB();
    } catch (err) {
        console.error("Database connection error in serverless function:", err);
    }
    return app(req, res);
};