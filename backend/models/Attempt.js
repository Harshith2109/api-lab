const mongoose = require('mongoose');

const AttemptSchema = new mongoose.Schema({
  attempt_id: {
    type: Number,
    required: true,
    unique: true
  },
  student_id: {
    type: String,
    required: true
  },
  exam_id: {
    type: Number,
    required: true
  },
  start_time: {
    type: Date,
    default: Date.now
  },
  end_time: {
    type: Date
  },
  answers: {
    type: Map,
    of: String,
    default: {}
  },
  score: {
    type: Number,
    default: 0
  },
  question_scores: {
    type: Map,
    of: Number,
    default: {}
  },
  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'graded'],
    default: 'in_progress'
  }
}, { timestamps: true });

module.exports = mongoose.model('Attempt', AttemptSchema);
