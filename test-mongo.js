const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

async function testConnection() {
    console.log('Testing connection to:', uri.replace(/:([^@]+)@/, ':****@'));
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log('SUCCESS: Connected to MongoDB');
        process.exit(0);
    } catch (err) {
        console.error('FAILURE: Could not connect to MongoDB');
        console.error(err);
        process.exit(1);
    }
}

testConnection();
