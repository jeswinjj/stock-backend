const app = require("../server");
const connectDB = require("../config/db");

module.exports = async (req, res) => {
    try {
        await connectDB();
    } catch (err) {
        console.error("Database connection error in serverless function:", err);
        // We don't return here because app(req, res) might have its own error handling
    }
    return app(req, res);
};