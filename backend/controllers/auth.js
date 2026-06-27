const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role, userId: user.userId },
      process.env.JWT_SECRET || 'supersecretjwtkey',
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        fullname: user.fullname,
        email: user.email,
        userId: user.userId
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.register = async (req, res) => {
  try {
    const { username, password, role, fullname, email, userId } = req.body;
    if (!username || !password || !fullname || !userId) {
      return res.status(400).json({ error: 'Required fields: username, password, fullname, userId' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const existingUserId = await User.findOne({ userId });
    if (existingUserId) {
      return res.status(400).json({ error: 'User ID already exists' });
    }

    const newUser = new User({
      username,
      password,
      role: role || 'student',
      fullname,
      email,
      userId
    });

    await newUser.save();
    return res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        fullname: newUser.fullname,
        email: newUser.email,
        userId: newUser.userId
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
