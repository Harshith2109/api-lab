const Exam = require('../models/Exam');
const User = require('../models/User');
const MoodleAPIClient = require('../moodle_api/client');

const moodleClient = new MoodleAPIClient(process.env.MOODLE_URL, process.env.MOODLE_TOKEN);

exports.initInstructor = async (req, res) => {
  try {
    const { instructor_id } = req.body;
    if (!instructor_id) {
      return res.status(400).json({ error: 'instructor_id required' });
    }

    // Try loading info from Moodle client
    const profile = await moodleClient.getUserProfile(instructor_id);
    const moodleUser = profile[0] || {};

    return res.status(200).json({
      message: 'Instructor initialized',
      instructor: {
        instructor_id: parseInt(instructor_id),
        name: moodleUser.fullname || 'Instructor',
        email: moodleUser.email || 'unknown'
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createExam = async (req, res) => {
  try {
    const instructor_id = parseInt(req.params.instructor_id);
    const { course_id, exam_name, description, duration, total_marks, passing_marks } = req.body;

    if (!course_id || !exam_name) {
      return res.status(400).json({ error: 'course_id and exam_name required' });
    }

    // Find the next available numeric exam_id
    const maxExam = await Exam.findOne({}).sort({ exam_id: -1 });
    const nextExamId = maxExam ? maxExam.exam_id + 1 : 1;

    const newExam = new Exam({
      exam_id: nextExamId,
      course_id: parseInt(course_id),
      exam_name,
      description: description || `Exam: ${exam_name}`,
      instructor_id,
      duration: duration ? parseInt(duration) : 3600,
      total_marks: total_marks ? parseInt(total_marks) : 100,
      passing_marks: passing_marks ? parseInt(passing_marks) : 40,
      questions: [],
      eligible_students: []
    });

    await newExam.save();

    return res.status(201).json({
      message: 'Exam created successfully',
      exam: {
        exam_id: newExam.exam_id,
        course_id: newExam.course_id,
        exam_name: newExam.exam_name,
        description: newExam.description,
        instructor_id: newExam.instructor_id,
        duration: newExam.duration,
        total_marks: newExam.total_marks,
        passing_marks: newExam.passing_marks,
        is_active: newExam.is_active,
        questions: newExam.questions,
        eligible_students: newExam.eligible_students
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.addQuestion = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const { question_text, question_type, marks, options, correct_answer } = req.body;

    if (!question_text || !question_type) {
      return res.status(400).json({ error: 'question_text and question_type required' });
    }

    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: `Exam ${exam_id} not found` });
    }

    const validTypes = ['multiple_choice', 'true_false', 'short_answer', 'essay'];
    if (!validTypes.includes(question_type)) {
      return res.status(400).json({ error: `Invalid question type: ${question_type}` });
    }

    if (question_type === 'multiple_choice') {
      if (!options || options.length < 2) {
        return res.status(400).json({ error: 'Multiple choice questions need at least 2 options' });
      }
      if (correct_answer === undefined || correct_answer === null || parseInt(correct_answer) >= options.length) {
        return res.status(400).json({ error: `Invalid correct answer index: ${correct_answer}` });
      }
    }

    const nextQuestionId = exam.questions.length + 1;

    // Convert options array/object to Map
    let optionsMap = {};
    if (options) {
      if (Array.isArray(options)) {
        options.forEach((opt, idx) => {
          optionsMap[idx] = opt;
        });
      } else {
        optionsMap = options;
      }
    }

    const question = {
      question_id: nextQuestionId,
      question_text,
      question_type,
      marks: marks ? parseInt(marks) : 1,
      options: optionsMap,
      correct_answer
    };

    exam.questions.push(question);
    await exam.save();

    return res.status(201).json({
      message: 'Question added successfully',
      question
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getExamDetails = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    return res.status(200).json({
      message: 'Exam details retrieved',
      exam
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getExamQuestions = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }
    return res.status(200).json({
      message: 'Questions retrieved',
      total: exam.questions.length,
      questions: exam.questions
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.addEligibleStudents = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const { student_ids } = req.body;

    if (!student_ids || !Array.isArray(student_ids)) {
      return res.status(400).json({ error: 'student_ids array required' });
    }

    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    let enrolledIds = new Set();
    try {
      const enrolledUsers = await moodleClient.getEnrolledUsers(exam.course_id);
      if (enrolledUsers && enrolledUsers.length > 0) {
        enrolledUsers.forEach(u => enrolledIds.add(u.id));
      }
    } catch (e) {
      console.warn(`Enrollment verification skipped: ${e.message}`);
    }

    const validStudents = [];
    student_ids.forEach(id => {
      const parsedId = parseInt(id);
      if (enrolledIds.size === 0 || enrolledIds.has(parsedId)) {
        if (!exam.eligible_students.includes(parsedId)) {
          exam.eligible_students.push(parsedId);
        }
        validStudents.push(parsedId);
      }
    });

    await exam.save();

    return res.status(200).json({
      message: 'Students added successfully',
      count: validStudents.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.activateExam = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    exam.is_active = true;
    await exam.save();

    return res.status(200).json({
      message: 'Exam activated',
      exam_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.deactivateExam = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    exam.is_active = false;
    await exam.save();

    return res.status(200).json({
      message: 'Exam deactivated / ended',
      exam_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getExams = async (req, res) => {
  try {
    const instructor_id = parseInt(req.params.instructor_id);
    const exams = await Exam.find({ instructor_id });
    return res.status(200).json({
      message: 'Exams retrieved',
      exams
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.updateExam = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const { exam_name, description, duration, total_marks, passing_marks } = req.body;

    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (exam_name) exam.exam_name = exam_name;
    if (description !== undefined) exam.description = description;
    if (duration) exam.duration = parseInt(duration);
    if (total_marks) exam.total_marks = parseInt(total_marks);
    if (passing_marks) exam.passing_marks = parseInt(passing_marks);

    await exam.save();

    return res.status(200).json({
      message: 'Exam updated successfully',
      exam
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const Attempt = require('../models/Attempt');
exports.getExamAttempts = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const attempts = await Attempt.find({ exam_id }).lean();
    
    // Fetch user details for each attempt
    const enrichedAttempts = await Promise.all(
      attempts.map(async (att) => {
        const student = await User.findOne({ userId: att.student_id }).select('fullname email').lean();
        return {
          ...att,
          student_name: student ? student.fullname : `Student #${att.student_id}`,
          student_email: student ? student.email : ''
        };
      })
    );

    return res.status(200).json({
      message: 'Attempts retrieved',
      attempts: enrichedAttempts
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
