require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { protect, authorize } = require('./middleware/auth');

const authController = require('./controllers/auth');
const adminController = require('./controllers/admin');
const instructorController = require('./controllers/instructor');
const studentController = require('./controllers/student');

const app = express();

// Connect to MongoDB & Seed Initial Users
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// ==================== HEALTH CHECK ====================
app.use('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'MERN Online Exam System API'
  });
});

// ==================== AUTH ROUTES ====================
app.post('/api/auth/login', authController.login);
app.post('/api/auth/register', authController.register);

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/users', protect, authorize('admin', 'instructor'), adminController.getUsers);
app.post('/api/admin/users', protect, authorize('admin'), adminController.createUser);
app.delete('/api/admin/users/:user_id', protect, authorize('admin'), adminController.deleteUser);
app.get('/api/admin/exams', protect, authorize('admin'), adminController.getAllExams);
app.put('/api/admin/exams/:exam_id/stop', protect, authorize('admin'), adminController.stopExam);
app.delete('/api/admin/exams/:exam_id', protect, authorize('admin'), adminController.deleteExam);

// ==================== INSTRUCTOR ENDPOINTS ====================
app.post('/api/instructor/init', instructorController.initInstructor);
app.post('/api/instructor/:instructor_id/exams', instructorController.createExam);
app.post('/api/instructor/:instructor_id/exams/:exam_id/questions', instructorController.addQuestion);
app.get('/api/instructor/:instructor_id/exams/:exam_id', instructorController.getExamDetails);
app.get('/api/instructor/:instructor_id/exams/:exam_id/questions', instructorController.getExamQuestions);
app.post('/api/instructor/:instructor_id/exams/:exam_id/students', instructorController.addEligibleStudents);
app.put('/api/instructor/:instructor_id/exams/:exam_id/activate', instructorController.activateExam);
app.put('/api/instructor/:instructor_id/exams/:exam_id/deactivate', instructorController.deactivateExam);
app.put('/api/instructor/:instructor_id/exams/:exam_id', instructorController.updateExam);
app.get('/api/instructor/:instructor_id/exams/:exam_id/attempts', instructorController.getExamAttempts);
app.get('/api/instructor/:instructor_id/exams', instructorController.getExams);

// ==================== STUDENT ENDPOINTS ====================
app.post('/api/student/init', studentController.initStudent);
app.get('/api/student/exams/ongoing', studentController.getOngoingExams);
app.post('/api/student/:student_id/exams/available', studentController.getAvailableExams);
app.post('/api/student/:student_id/exams/:exam_id/start', studentController.startExam);
app.post('/api/student/:student_id/exams/:exam_id/submit-answer', studentController.submitAnswer);
app.get('/api/student/:student_id/exams/:exam_id/time-remaining', studentController.getTimeRemaining);
app.post('/api/student/:student_id/exams/:exam_id/submit', studentController.submitExam);
app.get('/api/student/:student_id/attempts', studentController.getStudentAttempts);

// ==================== ERROR HANDLERS ====================
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  ========================================
  Online Exam System - Node/Express Server
  Powered by MongoDB & Moodle
  ========================================
  
  Starting server on http://localhost:${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  Moodle URL: ${process.env.MOODLE_URL}
  `);
});
