const Exam = require('../models/Exam');
const Attempt = require('../models/Attempt');
const MoodleAPIClient = require('../moodle_api/client');

const moodleClient = new MoodleAPIClient(process.env.MOODLE_URL, process.env.MOODLE_TOKEN);

exports.initStudent = async (req, res) => {
  try {
    const { student_id } = req.body;
    if (!student_id) {
      return res.status(400).json({ error: 'student_id required' });
    }

    const profile = await moodleClient.getUserProfile(student_id);
    const moodleUser = profile[0] || {};

    return res.status(200).json({
      message: 'Student initialized',
      student: {
        student_id: parseInt(student_id),
        name: moodleUser.fullname || 'Student',
        email: moodleUser.email || 'unknown'
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getAvailableExams = async (req, res) => {
  try {
    const student_id = parseInt(req.params.student_id);
    const { instructor_id } = req.body;

    if (!instructor_id) {
      return res.status(400).json({ error: 'instructor_id required' });
    }

    // Find all active exams for this instructor where student is eligible
    const exams = await Exam.find({
      instructor_id: parseInt(instructor_id),
      is_active: true,
      eligible_students: student_id
    });

    return res.status(200).json({
      message: 'Available exams retrieved',
      count: exams.length,
      exams
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.startExam = async (req, res) => {
  try {
    const student_id = parseInt(req.params.student_id);
    const exam_id = parseInt(req.params.exam_id);
    const { instructor_id } = req.body;

    if (!instructor_id) {
      return res.status(400).json({ error: 'instructor_id required' });
    }

    const exam = await Exam.findOne({ exam_id, instructor_id: parseInt(instructor_id) });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (!exam.is_active) {
      return res.status(403).json({ error: 'Exam is not active' });
    }

    if (!exam.eligible_students.includes(student_id)) {
      return res.status(403).json({ error: 'Student not eligible for this exam' });
    }

    // Check if there is an in-progress attempt
    let attempt = await Attempt.findOne({ student_id, exam_id, status: 'in_progress' });
    if (!attempt) {
      const maxAttempt = await Attempt.findOne({}).sort({ attempt_id: -1 });
      const nextAttemptId = maxAttempt ? maxAttempt.attempt_id + 1 : 1;

      attempt = new Attempt({
        attempt_id: nextAttemptId,
        student_id,
        exam_id,
        start_time: new Date(),
        answers: {},
        status: 'in_progress'
      });
      await attempt.save();
    }

    // Return questions without correct answers
    const safeQuestions = exam.questions.map(q => {
      const qObj = q.toObject({ flattenMaps: true });
      delete qObj.correct_answer;
      return qObj;
    });

    return res.status(200).json({
      message: 'Exam started',
      attempt_id: attempt.attempt_id,
      exam_id,
      duration: exam.duration,
      total_questions: safeQuestions.length,
      total_marks: exam.total_marks,
      questions: safeQuestions
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.submitAnswer = async (req, res) => {
  try {
    const student_id = parseInt(req.params.student_id);
    const exam_id = parseInt(req.params.exam_id);
    const { attempt_id, question_id, answer } = req.body;

    if (attempt_id === undefined || question_id === undefined || answer === undefined) {
      return res.status(400).json({ error: 'attempt_id, question_id, and answer required' });
    }

    const attempt = await Attempt.findOne({ attempt_id: parseInt(attempt_id), student_id, exam_id });
    if (!attempt) {
      return res.status(404).json({ error: `Attempt ${attempt_id} not found` });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: `Cannot submit answer. Attempt status: ${attempt.status}` });
    }

    // Save answer as string in the map
    attempt.answers.set(String(question_id), String(answer));
    await attempt.save();

    return res.status(200).json({
      message: 'Answer submitted',
      question_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getTimeRemaining = async (req, res) => {
  try {
    const student_id = parseInt(req.params.student_id);
    const exam_id = parseInt(req.params.exam_id);
    const attempt_id = parseInt(req.query.attempt_id);

    if (!attempt_id) {
      return res.status(400).json({ error: 'attempt_id query param required' });
    }

    const exam = await Exam.findOne({ exam_id });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const attempt = await Attempt.findOne({ attempt_id, student_id, exam_id });
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const elapsed = (Date.now() - new Date(attempt.start_time).getTime()) / 1000;
    const remaining = Math.max(0, exam.duration - elapsed);

    return res.status(200).json({
      remaining_seconds: Math.floor(remaining),
      exam_id,
      attempt_id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.submitExam = async (req, res) => {
  try {
    const student_id = parseInt(req.params.student_id);
    const exam_id = parseInt(req.params.exam_id);
    const { attempt_id, instructor_id } = req.body;

    if (attempt_id === undefined || !instructor_id) {
      return res.status(400).json({ error: 'attempt_id and instructor_id required' });
    }

    const exam = await Exam.findOne({ exam_id, instructor_id: parseInt(instructor_id) });
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const attempt = await Attempt.findOne({ attempt_id: parseInt(attempt_id), student_id, exam_id });
    if (!attempt) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ error: 'Attempt already submitted' });
    }

    // Calculate score
    let totalMarks = 0;
    let obtainedMarks = 0;

    exam.questions.forEach(question => {
      const qIdStr = String(question.question_id);
      totalMarks += question.marks;

      if (attempt.answers.has(qIdStr)) {
        const studentAns = attempt.answers.get(qIdStr);
        const correctAns = question.correct_answer;

        if (question.question_type === 'multiple_choice') {
          if (String(studentAns) === String(correctAns)) {
            obtainedMarks += question.marks;
          }
        } else if (question.question_type === 'true_false') {
          if (String(studentAns).toLowerCase() === String(correctAns).toLowerCase()) {
            obtainedMarks += question.marks;
          }
        }
        // Short answer and essay require manual grading (score contribution = 0 for now)
      }
    });

    const score = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
    const isPassed = score >= exam.passing_marks;

    attempt.score = score;
    attempt.status = 'graded';
    attempt.end_time = new Date();
    await attempt.save();

    // Get simple text feedback based on score
    let feedback = "Keep studying to improve your score.";
    if (isPassed) {
      feedback = "Excellent work! You have successfully passed the exam.";
    }

    return res.status(200).json({
      message: 'Exam submitted successfully',
      result: {
        attempt_id: attempt.attempt_id,
        student_id,
        exam_id,
        score,
        passing_marks: exam.passing_marks,
        is_passed: isPassed,
        status: 'graded',
        submission_time: attempt.end_time.toISOString()
      },
      feedback
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getStudentAttempts = async (req, res) => {
  try {
    const student_id = parseInt(req.params.student_id);
    const attempts = await Attempt.find({ student_id });
    return res.status(200).json({
      message: 'Attempts retrieved',
      count: attempts.length,
      attempts
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
