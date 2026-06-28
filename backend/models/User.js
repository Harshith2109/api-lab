const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'instructor', 'student'],
    default: 'student'
  },
  fullname: {
    type: String,
    required: true
  },
  email: {
    type: String,
    trim: true
  },
  userId: {
    type: String,
    required: true,
    unique: true
  }
}, { timestamps: true });

// Pre-save hook to hash password and ensure userId is an auto-assigned human-readable ID if missing
UserSchema.pre('save', async function (next) {
  if (!this.userId) {
    const prefix = this.role === 'admin' ? 'USR-ADM' : this.role === 'instructor' ? 'USR-INS' : 'USR-STU';
    const randomNum = Math.floor(100 + Math.random() * 900);
    this.userId = `${prefix}-${randomNum}`;
  }

  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to verify passwords
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
