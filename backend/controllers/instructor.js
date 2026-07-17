const Exam = require('../models/Exam');
const User = require('../models/User');
const Attempt = require('../models/Attempt');
const MoodleAPIClient = require('../moodle_api/client');

// Initialize Moodle API Client
const moodleClient = new MoodleAPIClient(process.env.MOODLE_URL, process.env.MOODLE_TOKEN);

exports.initInstructor = async (req, res) => {
  try {
    const { instructor_id } = req.body;
    if (!instructor_id) {
      return res.status(400).json({ error: 'instructor_id required' });
    }

    const user = await User.findOne({ $or: [{ userId: String(instructor_id) }, { username: String(instructor_id) }] });

    return res.status(200).json({
      message: 'Instructor initialized',
      instructor: {
        instructor_id: String(instructor_id),
        name: user ? user.fullname : 'Instructor',
        email: user ? user.email : 'unknown'
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createExam = async (req, res) => {
  try {
    const instructor_id = String(req.params.instructor_id);
    const { course_id, exam_name, description, duration, total_marks, passing_marks, questions } = req.body;

    if (!course_id || !exam_name) {
      return res.status(400).json({ error: 'course_id and exam_name required' });
    }

    // Verify course exists in Moodle API
    try {
      const courses = await moodleClient.getCourses([parseInt(course_id)]);
      if (!courses || courses.length === 0) {
        console.warn(`Warning: Course ID ${course_id} not found in Moodle courses.`);
      } else {
        console.log(`Verified course with Moodle: ${courses[0].fullname}`);
      }
    } catch (err) {
      console.warn(`Moodle course verification failed: ${err.message}`);
    }

    const intendedTotal = total_marks ? parseInt(total_marks) : 100;

    // Strict validation if questions are supplied
    if (questions && Array.isArray(questions) && questions.length > 0) {
      const combinedMarks = questions.reduce((sum, q) => sum + (parseInt(q.marks) || 0), 0);
      if (combinedMarks !== intendedTotal) {
        return res.status(400).json({
          error: `Total question marks (${combinedMarks}) must equal intended exam total marks (${intendedTotal}).`
        });
      }
    }

    // Find the next available numeric exam_id
    const maxExam = await Exam.findOne({}).sort({ exam_id: -1 });
    const nextExamId = maxExam ? maxExam.exam_id + 1 : 1;

    let formattedQuestions = [];
    if (questions && Array.isArray(questions)) {
      formattedQuestions = questions.map((q, qIdx) => {
        let optionsMap = {};
        if (q.options) {
          if (Array.isArray(q.options)) {
            q.options.forEach((opt, idx) => { optionsMap[idx] = opt; });
          } else {
            optionsMap = q.options;
          }
        }
        return {
          question_id: qIdx + 1,
          question_text: q.question_text || `Question ${qIdx + 1}`,
          question_type: q.question_type || 'multiple_choice',
          marks: q.marks ? parseInt(q.marks) : 10,
          options: optionsMap,
          correct_answer: q.correct_answer || '0'
        };
      });
    }

    const newExam = new Exam({
      exam_id: nextExamId,
      course_id: parseInt(course_id),
      exam_name,
      description: description || `Exam: ${exam_name}`,
      instructor_id,
      duration: duration ? parseInt(duration) : 3600,
      total_marks: intendedTotal,
      passing_marks: passing_marks ? parseInt(passing_marks) : 40,
      questions: formattedQuestions,
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

    let optionsMap = {};
    if (options) {
      if (Array.isArray(options)) {
        options.forEach((opt, idx) => { optionsMap[idx] = opt; });
      } else {
        optionsMap = options;
      }
    }

    const nextQuestionId = exam.questions.length + 1;
    const question = {
      question_id: nextQuestionId,
      question_text,
      question_type,
      marks: marks ? parseInt(marks) : 10,
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

    const validStudents = [];
    student_ids.forEach(id => {
      const strId = String(id);
      if (!exam.eligible_students.includes(strId)) {
        exam.eligible_students.push(strId);
      }
      validStudents.push(strId);
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
    const instructor_id = String(req.params.instructor_id);
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

exports.getExamAttempts = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const exam = await Exam.findOne({ exam_id }).lean();
    const attempts = await Attempt.find({ exam_id }).lean();

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
      questions: exam ? exam.questions : [],
      attempts: enrichedAttempts
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.gradeAttempt = async (req, res) => {
  try {
    const attempt_id = parseInt(req.params.attempt_id);
    const exam_id = parseInt(req.params.exam_id);
    const { question_scores } = req.body || {};

    const attempt = await Attempt.findOne({ attempt_id, exam_id });
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (!attempt.question_scores) {
      attempt.question_scores = new Map();
    }

    let obtainedMarks = 0;
    const totalMarks = Number(exam.total_marks) || 100;

    exam.questions.forEach((q) => {
      const qIdStr = String(q.question_id);
      if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
        const studentAns = attempt.answers ? attempt.answers.get(qIdStr) : undefined;
        let autoMark = 0;
        if (studentAns !== undefined && studentAns !== null) {
          if (q.question_type === 'multiple_choice' && String(studentAns) === String(q.correct_answer)) {
            autoMark = Number(q.marks);
          } else if (q.question_type === 'true_false' && String(studentAns).toLowerCase() === String(q.correct_answer).toLowerCase()) {
            autoMark = Number(q.marks);
          }
        }

        if (question_scores && question_scores[qIdStr] !== undefined && question_scores[qIdStr] !== null && String(question_scores[qIdStr]) !== '') {
          const assignedScore = Number(question_scores[qIdStr]);
          attempt.question_scores.set(qIdStr, assignedScore);
          obtainedMarks += assignedScore;
        } else {
          attempt.question_scores.set(qIdStr, autoMark);
          obtainedMarks += autoMark;
        }
      } else {
        const assignedScore = (question_scores && question_scores[qIdStr] !== undefined) ? Number(question_scores[qIdStr]) : 0;
        attempt.question_scores.set(qIdStr, assignedScore);
        obtainedMarks += assignedScore;
      }
    });

    const finalPercentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
    attempt.score = finalPercentage;
    attempt.status = 'graded';
    await attempt.save();

    return res.status(200).json({
      message: 'Evaluation finalized and results published successfully',
      attempt: {
        attempt_id: attempt.attempt_id,
        score: attempt.score,
        status: attempt.status
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.allowReattempt = async (req, res) => {
  try {
    const exam_id = parseInt(req.params.exam_id);
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ error: 'student_id required' });
    }

    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const strId = String(student_id);
    if (!exam.reattempt_students) {
      exam.reattempt_students = [];
    }

    if (!exam.reattempt_students.includes(strId)) {
      exam.reattempt_students.push(strId);
    }

    await exam.save();

    return res.status(200).json({
      message: `Reattempt granted successfully for student ${student_id}`,
      exam_id,
      student_id: strId
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
