const User = require('../models/User');
const Exam = require('../models/Exam');
const Attempt = require('../models/Attempt');

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
    if (!username || !password || !fullname) {
      return res.status(400).json({ error: 'Required fields: username, password, fullname' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    if (userId !== undefined && userId !== null) {
      const existingUserId = await User.findOne({ userId });
      if (existingUserId) {
        return res.status(400).json({ error: 'User ID already exists' });
      }
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

exports.deleteUser = async (req, res) => {
  try {
    const targetId = req.params.user_id;

    // Prevent self deletion
    if (req.user && (String(req.user._id) === targetId || req.user.userId === targetId)) {
      return res.status(400).json({ error: 'Admins cannot delete their own active logged-in account.' });
    }

    const deletedUser = await User.findOneAndDelete({
      $or: [{ _id: targetId }, { userId: targetId }]
    });

    if (!deletedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({
      message: 'User deleted successfully',
      userId: deletedUser.userId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ exams });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.stopExam = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    exam.is_active = false;
    await exam.save();

    return res.status(200).json({
      message: 'Exam stopped successfully by Admin',
      exam_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const deletedExam = await Exam.findOneAndDelete({ exam_id });

    if (!deletedExam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // Delete associated attempt records
    await Attempt.deleteMany({ exam_id });

    return res.status(200).json({
      message: 'Exam and all associated attempt histories deleted permanently',
      exam_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
