const User = require('../models/User');

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    return res.status(200).json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, password, role, fullname, email, userId } = req.body;
    if (!username || !password || !fullname || !userId) {
      return res.status(400).json({ error: 'Required fields: username, password, fullname, userId' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
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
      message: 'User created successfully',
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
