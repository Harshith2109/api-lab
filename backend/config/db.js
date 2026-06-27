const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/exam_system');
    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
    
    // Seed users from USERS_FILE_PATH
    await seedUsers();
  } catch (err) {
    console.error(`✗ Database connection error: ${err.message}`);
    process.exit(1);
  }
};

const seedUsers = async () => {
  try {
    const usersPath = process.env.USERS_FILE_PATH || './users.json';
    const absolutePath = path.resolve(usersPath);
    
    if (!fs.existsSync(absolutePath)) {
      console.log(`ℹ Seed users file not found at ${absolutePath}, skipping seeding.`);
      return;
    }
    
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');
    const seedUsersData = JSON.parse(fileContent);
    
    console.log(`ℹ Seeding users from: ${absolutePath}`);
    for (const userData of seedUsersData) {
      const userExists = await User.findOne({ username: userData.username });
      if (!userExists) {
        // Create new user instance to trigger pre-save password hashing
        const newUser = new User(userData);
        await newUser.save();
        console.log(`  + Created user: ${userData.username} (${userData.role})`);
      } else {
        console.log(`  = User already exists: ${userData.username}`);
      }
    }
    console.log('✓ Seeding process complete.');
  } catch (err) {
    console.error(`✗ Seeding failed: ${err.message}`);
  }
};

module.exports = connectDB;
