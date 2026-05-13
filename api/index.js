const app = require("../server");
const connectDB = require("../config/db");

module.exports = async (req, res) => {
    try {
        await connectDB();
    } catch (err) {
        console.error("Database connection error in serverless function:", err);
    }
    
    // Log incoming request info for Vercel debugging
    console.log(`[VERCEL] ${req.method} ${req.url} (originalUrl: ${req.originalUrl})`);
    
    return app(req, res);
};