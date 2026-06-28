const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema({
  question_id: {
    type: Number,
    required: true
  },
  question_text: {
    type: String,
    required: true
  },
  question_type: {
    type: String,
    enum: ['multiple_choice', 'true_false', 'short_answer', 'essay'],
    required: true
  },
  marks: {
    type: Number,
    default: 1
  },
  options: {
    type: Map,
    of: String,
    default: {}
  },
  correct_answer: {
    type: mongoose.Schema.Types.Mixed
  }
});

const ExamSchema = new mongoose.Schema({
  exam_id: {
    type: Number,
    required: true,
    unique: true
  },
  course_id: {
    type: Number,
    required: true
  },
  exam_name: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  instructor_id: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 3600
  },
  total_marks: {
    type: Number,
    default: 100
  },
  passing_marks: {
    type: Number,
    default: 40
  },
  questions: [QuestionSchema],
  eligible_students: [{
    type: String
  }],
  is_active: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Exam', ExamSchema);
