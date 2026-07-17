import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LogIn, UserPlus, LogOut, BookOpen, Plus,
  FileText, Play, CheckCircle2, User,
  Clock, ShieldAlert, Users, Award, Eye, EyeOff, Sun, Moon
} from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';

export default function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [view, setView] = useState('login'); // login, register, admin, instructor, student, exam-runner

  // Login State
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Register State (used by registration or admin user creation)
  const [regUser, setRegUser] = useState({
    username: '', password: '', fullname: '', email: '', role: 'student', userId: ''
  });
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // Dashboard Tab Navigation States
  const [instructorTab, setInstructorTab] = useState('build');
  const [studentTab, setStudentTab] = useState('ongoing');
  const [adminTab, setAdminTab] = useState('create');

  // Admin Dashboard State
  const [usersList, setUsersList] = useState([]);
  const [adminExams, setAdminExams] = useState([]);

  // Instructor Dashboard State
  const [exams, setExams] = useState([]);
  const [newExam, setNewExam] = useState({
    course_id: '', exam_name: '', description: '', duration: 3600, total_marks: 100, passing_marks: 40
  });
  const [targetQuestionCount, setTargetQuestionCount] = useState(1);
  const [defaultQuestionType, setDefaultQuestionType] = useState('multiple_choice');
  const [examQuestionsList, setExamQuestionsList] = useState([]);
  const [eligibleStudentIds, setEligibleStudentIds] = useState('');
  const [eligibilityExamId, setEligibilityExamId] = useState('');
  const [editingExam, setEditingExam] = useState(null);
  const [viewingAttemptsExam, setViewingAttemptsExam] = useState(null);
  const [examAttempts, setExamAttempts] = useState([]);
  const [evaluatingAttempt, setEvaluatingAttempt] = useState(null);
  const [examQuestions, setExamQuestions] = useState([]);
  const [questionScores, setQuestionScores] = useState({});
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraWarnings, setCameraWarnings] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);

  // Student Dashboard State
  const [availableExams, setAvailableExams] = useState([]);
  const [studentAttempts, setStudentAttempts] = useState([]);
  const [activeExam, setActiveExam] = useState(null); // Active exam object for student
  const [activeAttemptId, setActiveAttemptId] = useState(null);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Ongoing Exams Overview State
  const [ongoingExams, setOngoingExams] = useState([]);
  const [ongoingFilter, setOngoingFilter] = useState('');

  // Setup Authorization Header
  const getHeaders = () => ({
    headers: { Authorization: `Bearer ${token}` }
  });

  // Apply & persist theme attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Sync view with role on startup / login
  useEffect(() => {
    if (token && currentUser) {
      if (currentUser.role === 'admin') setView('admin');
      else if (currentUser.role === 'instructor') setView('instructor');
      else if (currentUser.role === 'student') setView('student');
    } else {
      setView('login');
    }
  }, [token, currentUser]);

  // Load Admin/Instructor/Student specific data
  useEffect(() => {
    if (!token || !currentUser) return;

    if (currentUser.role === 'admin') {
      loadUsers();
      loadAdminExams();
    } else if (currentUser.role === 'instructor') {
      loadInstructorExams();
      loadUsers();
    } else if (currentUser.role === 'student') {
      loadStudentAttempts();
      loadOngoingExams();
    }
  }, [view, token, currentUser]);

  // Auto-reload users whenever instructor views eligibility tab
  useEffect(() => {
    if (view === 'instructor' && instructorTab === 'eligibility' && token) {
      loadUsers();
    }
  }, [view, instructorTab, token]);

  // Live Exam Timer Hook
  useEffect(() => {
    if (view !== 'exam-runner' || !activeExam || !activeAttemptId) return;

    const timer = setInterval(async () => {
      try {
        const res = await axios.get(
          `${API_BASE}/student/${currentUser.userId}/exams/${activeExam.exam_id}/time-remaining?attempt_id=${activeAttemptId}`,
          getHeaders()
        );
        const remaining = res.data.remaining_seconds;
        setTimeRemaining(remaining);

        if (remaining <= 0) {
          clearInterval(timer);
          alert("Time's up! Submitting exam automatically...");
          handleExamSubmit();
        }
      } catch (err) {
        console.error('Error fetching time remaining:', err);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [view, activeExam, activeAttemptId]);

  // Proctoring Monitor Hook (Webcam, Tab focus, Fullscreen enforcement)
  useEffect(() => {
    if (view !== 'exam-runner' || !activeExam || !activeAttemptId) return;

    let localStream = null;
    let checkTimeout = null;
    let graceTimeout = null;
    let isActiveSession = true;

    const requestFullScreen = () => {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => {
          console.warn("Fullscreen request denied: ", err.message);
        });
      }
    };

    // Prompt fullscreen on start
    requestFullScreen();

    // 1. Initialize Webcam
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!isActiveSession) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        localStream = stream;
        setCameraStream(stream);
        setCameraActive(true);
        setCameraWarnings(0);

        // Listen for track ending/muting
        stream.getVideoTracks().forEach(track => {
          track.addEventListener('ended', () => {
            logViolation("Webcam track ended / disconnected");
            setCameraActive(false);
          });
          track.addEventListener('mute', () => {
            logViolation("Webcam feed muted / disabled");
            setCameraActive(false);
          });
          track.addEventListener('unmute', () => {
            setCameraActive(true);
          });
        });
      } catch (err) {
        console.error("Camera permission error:", err);
        setCameraActive(false);
        logViolation("Webcam permission denied / blocked");
        // Issue immediate warning
        setCameraWarnings(prev => {
          const next = prev + 1;
          alert(`🚨 PROCTORING WARNING: Camera permission is required! (Warning ${next} of 3). You will be disqualified if not resolved.`);
          return next;
        });
      }
    };

    startCamera();

    const logViolation = async (reason) => {
      try {
        await axios.post(
          `${API_BASE}/student/${currentUser.userId}/exams/${activeExam.exam_id}/violation`,
          { reason },
          getHeaders()
        );
      } catch (err) {
        console.error("Error logging proctoring violation:", err);
      }
    };

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        const reason = "Tab switched / Window minimized";
        await logViolation(reason);
        setCameraWarnings(prev => {
          const next = prev + 1;
          alert(`🚨 PROCTORING WARNING: Tab switching is strictly prohibited! (Warning ${next} of 3). You will be disqualified if not resolved.`);
          return next;
        });
      }
    };

    const handleFullScreenChange = async () => {
      if (!document.fullscreenElement) {
        const reason = "Exited full screen mode";
        await logViolation(reason);
        setCameraWarnings(prev => {
          const next = prev + 1;
          alert(`🚨 PROCTORING WARNING: Leaving full screen is not permitted! (Warning ${next} of 3). Please return to full screen.`);
          requestFullScreen();
          return next;
        });
      }
    };

    // Recursive timeout validation to prevent alert storms and race conditions
    const checkCameraStatus = () => {
      if (!isActiveSession) return;

      let isLive = false;
      if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack && videoTrack.readyState === 'live' && videoTrack.enabled) {
          isLive = true;
        }
      }

      if (!isLive) {
        setCameraActive(false);
        logViolation("Webcam feed inactive / disabled / blocked");
        setCameraWarnings(prev => {
          const next = prev + 1;
          if (next < 3) {
            alert(`🚨 PROCTORING WARNING: Camera is inactive! Please check connection. (Warning ${next} of 3). You will be disqualified if not resolved.`);
            checkTimeout = setTimeout(checkCameraStatus, 5000);
          }
          return next;
        });
      } else {
        setCameraActive(true);
        checkTimeout = setTimeout(checkCameraStatus, 5000);
      }
    };

    // Give 15-second grace period for the initial permission prompt to resolve
    graceTimeout = setTimeout(() => {
      checkCameraStatus();
    }, 15000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullScreenChange);

    return () => {
      isActiveSession = false;
      clearTimeout(graceTimeout);
      clearTimeout(checkTimeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err));
      }
    };
  }, [view, activeExam, activeAttemptId]);

  // Handle Camera warnings and disqualification
  useEffect(() => {
    if (view === 'exam-runner' && cameraWarnings >= 3) {
      handleExamSubmit(true);
    }
  }, [cameraWarnings, view]);

  // --- API OPERATIONS ---

  // Auth Operations
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await axios.post(`${API_BASE}/auth/login`, {
        username: loginUsername,
        password: loginPassword
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setCurrentUser(res.data.user);

      // Initialize student/instructor manager instances in backend (Flask-compatibility endpoints)
      if (res.data.user.role === 'student') {
        await axios.post(`${API_BASE}/student/init`, { student_id: res.data.user.userId });
      } else if (res.data.user.role === 'instructor') {
        await axios.post(`${API_BASE}/instructor/init`, { instructor_id: res.data.user.userId });
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken('');
    setCurrentUser(null);
    setView('login');
  };

  // Admin Operations
  const loadUsers = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/users`, getHeaders());
      setUsersList(res.data.users);
    } catch (err) {
      console.error('Error loading users:', err);
    }
  };

  const loadAdminExams = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/exams`, getHeaders());
      setAdminExams(res.data.exams || []);
    } catch (err) {
      console.error('Error loading admin exams:', err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');
    try {
      const payload = { ...regUser };
      if (!payload.userId) delete payload.userId; // Let backend auto-generate if blank
      await axios.post(`${API_BASE}/admin/users`, payload, getHeaders());
      setRegSuccess(`✓ User ${regUser.username} created successfully!`);
      setRegUser({ username: '', password: '', fullname: '', email: '', role: 'student', userId: '' });
      loadUsers();
    } catch (err) {
      setRegError(err.response?.data?.error || 'User creation failed.');
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    if (!window.confirm(`Are you sure you want to delete user "${userToDelete.fullname}" (${userToDelete.userId})? This cannot be undone.`)) {
      return;
    }
    try {
      await axios.delete(`${API_BASE}/admin/users/${userToDelete._id}`, getHeaders());
      alert(`✓ User ${userToDelete.fullname} removed successfully!`);
      loadUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user.');
    }
  };

  const handleAdminStopExam = async (examId) => {
    if (!window.confirm(`Are you sure you want to stop ongoing exam ID ${examId}? Students will no longer be able to take it.`)) {
      return;
    }
    try {
      await axios.put(`${API_BASE}/admin/exams/${examId}/stop`, {}, getHeaders());
      alert('✓ Exam stopped successfully!');
      loadAdminExams();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to stop exam.');
    }
  };

  const handleAdminDeleteExam = async (examId) => {
    if (!window.confirm(`⚠️ PERMANENT DELETE: Are you sure you want to remove exam ID ${examId} and all its attempt records?`)) {
      return;
    }
    try {
      await axios.delete(`${API_BASE}/admin/exams/${examId}`, getHeaders());
      alert('✓ Exam and attempts removed permanently!');
      loadAdminExams();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete exam.');
    }
  };

  // Instructor Operations
  const loadInstructorExams = async () => {
    try {
      // First initialize
      await axios.post(`${API_BASE}/instructor/init`, { instructor_id: currentUser.userId });
      // Get exams
      const res = await axios.get(`${API_BASE}/instructor/${currentUser.userId}/exams`, getHeaders());
      setExams(res.data.exams || []);
      loadUsers();
    } catch (err) {
      console.error('Error loading instructor exams:', err);
    }
  };

  const handleCreateExam = async (e) => {
    e.preventDefault();
    if (examQuestionsList.length === 0) {
      return alert('❌ Please add at least one question to the exam.');
    }

    const intendedTotal = parseInt(newExam.total_marks) || 0;
    const combinedQuestionMarks = examQuestionsList.reduce((sum, q) => sum + (parseInt(q.marks) || 0), 0);

    if (combinedQuestionMarks !== intendedTotal) {
      return alert(`❌ Total Marks Mismatch!\nCombined marks of all questions (${combinedQuestionMarks}) must equal intended total marks (${intendedTotal}).`);
    }

    try {
      await axios.post(`${API_BASE}/instructor/${currentUser.userId}/exams`, {
        course_id: parseInt(newExam.course_id),
        exam_name: newExam.exam_name,
        description: newExam.description,
        duration: parseInt(newExam.duration),
        total_marks: intendedTotal,
        passing_marks: parseInt(newExam.passing_marks),
        questions: examQuestionsList
      }, getHeaders());

      alert('✓ Exam and all questions created successfully in one unified step!');
      setNewExam({ course_id: '', exam_name: '', description: '', duration: 3600, total_marks: 100, passing_marks: 40 });
      setExamQuestionsList([]); // Resets to empty
      loadInstructorExams();
    } catch (err) {
      alert('Error creating exam: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleAddEligibility = async (e) => {
    e.preventDefault();
    if (!eligibilityExamId) return alert('Select an exam ID');
    try {
      const studentIds = eligibleStudentIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
      await axios.post(
        `${API_BASE}/instructor/${currentUser.userId}/exams/${eligibilityExamId}/students`,
        { student_ids: studentIds },
        getHeaders()
      );
      alert('Students added to eligibility list!');
      setEligibleStudentIds('');
      setEligibilityExamId('');
      loadInstructorExams();
    } catch (err) {
      alert('Error saving eligibility: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleActivateExam = async (examId) => {
    try {
      await axios.put(`${API_BASE}/instructor/${currentUser.userId}/exams/${examId}/activate`, {}, getHeaders());
      alert('Exam activated!');
      loadInstructorExams();
    } catch (err) {
      alert('Error activating exam: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeactivateExam = async (examId) => {
    try {
      await axios.put(`${API_BASE}/instructor/${currentUser.userId}/exams/${examId}/deactivate`, {}, getHeaders());
      alert('Exam deactivated / ended!');
      loadInstructorExams();
    } catch (err) {
      alert('Error ending exam: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdateExam = async (e) => {
    e.preventDefault();
    try {
      await axios.put(
        `${API_BASE}/instructor/${currentUser.userId}/exams/${editingExam.exam_id}`,
        {
          exam_name: editingExam.exam_name,
          description: editingExam.description,
          duration: parseInt(editingExam.duration),
          total_marks: parseInt(editingExam.total_marks),
          passing_marks: parseInt(editingExam.passing_marks)
        },
        getHeaders()
      );
      alert('Exam updated successfully!');
      setEditingExam(null);
      loadInstructorExams();
    } catch (err) {
      alert('Error updating exam: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleFetchAttempts = async (exam) => {
    try {
      const res = await axios.get(
        `${API_BASE}/instructor/${currentUser.userId}/exams/${exam.exam_id}/attempts`,
        getHeaders()
      );
      setExamAttempts(res.data.attempts || []);
      setExamQuestions(res.data.questions || exam.questions || []);
      setViewingAttemptsExam(exam);
      setEvaluatingAttempt(null);
    } catch (err) {
      alert('Error loading attempts: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleStartEvaluation = (att) => {
    setEvaluatingAttempt(att);
    const initialScores = {};
    if (att.question_scores) {
      const scoresObj = att.question_scores instanceof Map ? Object.fromEntries(att.question_scores) : att.question_scores;
      Object.keys(scoresObj).forEach(qId => {
        initialScores[qId] = scoresObj[qId];
      });
    }
    setQuestionScores(initialScores);
  };

  const handleSubmitEvaluation = async (e) => {
    e.preventDefault();
    if (!evaluatingAttempt || !viewingAttemptsExam) return;
    try {
      const res = await axios.post(
        `${API_BASE}/instructor/${currentUser.userId}/exams/${viewingAttemptsExam.exam_id}/attempts/${evaluatingAttempt.attempt_id}/grade`,
        { question_scores: questionScores },
        getHeaders()
      );
      alert(`✓ ${res.data.message || 'Evaluation finalized successfully!'}`);
      setEvaluatingAttempt(null);
      handleFetchAttempts(viewingAttemptsExam);
    } catch (err) {
      alert('Error finalizing evaluation: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleGrantReattempt = async (studentId, examId) => {
    try {
      const res = await axios.post(
        `${API_BASE}/instructor/${currentUser.userId}/exams/${examId}/reattempt`,
        { student_id: String(studentId) },
        getHeaders()
      );
      alert(`✓ ${res.data.message}`);
    } catch (err) {
      alert('Error granting reattempt: ' + (err.response?.data?.error || err.message));
    }
  };

  // Student Operations
  const loadStudentAttempts = async () => {
    try {
      // Init student manager
      await axios.post(`${API_BASE}/student/init`, { student_id: currentUser.userId });
      // Get attempts
      const resAttempts = await axios.get(`${API_BASE}/student/${currentUser.userId}/attempts`, getHeaders());
      setStudentAttempts(resAttempts.data.attempts || []);
    } catch (err) {
      console.error('Error loading student data:', err);
    }
  };

  const loadOngoingExams = async (searchTerm = '') => {
    try {
      const res = await axios.get(`${API_BASE}/student/exams/ongoing?search=${encodeURIComponent(searchTerm)}`);
      setOngoingExams(res.data.exams || []);
    } catch (err) {
      console.error('Error loading ongoing exams:', err);
    }
  };

  const handleQueryAvailableExams = async (instructorIdVal) => {
    if (!instructorIdVal) return;
    try {
      const res = await axios.post(`${API_BASE}/student/${currentUser.userId}/exams/available`, {
        instructor_id: String(instructorIdVal)
      }, getHeaders());
      setAvailableExams(res.data.exams || []);
    } catch (err) {
      alert('Error fetching available exams: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleStartExam = async (exam, instructorId) => {
    // Request fullscreen immediately inside the user click gesture stack
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen().catch(err => {
        console.warn("Fullscreen request denied: ", err.message);
      });
    }

    try {
      const actualInstructorId = (instructorId && instructorId !== 'undefined' && instructorId !== 'null')
        ? instructorId
        : (exam.instructor_id || localStorage.getItem('active_instructor_id') || '');

      const res = await axios.post(`${API_BASE}/student/${currentUser.userId}/exams/${exam.exam_id}/start`, {
        instructor_id: String(actualInstructorId)
      }, getHeaders());

      setActiveExam({
        ...res.data,
        instructor_id: String(actualInstructorId || res.data.instructor_id),
        exam_name: res.data.exam_name || exam.exam_name
      });
      setActiveAttemptId(res.data.attempt_id);
      setTimeRemaining(res.data.duration);
      setStudentAnswers({});
      setView('exam-runner');
    } catch (err) {
      alert('Error starting exam: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleAnswerSubmit = async (questionId, answerValue) => {
    try {
      await axios.post(`${API_BASE}/student/${currentUser.userId}/exams/${activeExam.exam_id}/submit-answer`, {
        attempt_id: activeAttemptId,
        question_id: parseInt(questionId),
        answer: String(answerValue)
      }, getHeaders());

      setStudentAnswers(prev => ({
        ...prev,
        [questionId]: answerValue
      }));
    } catch (err) {
      console.error('Error submitting answer:', err);
    }
  };

  const handleExamSubmit = async (isDisqualified = false) => {
    if (!activeExam) return;
    const disqualifiedFlag = isDisqualified === true;
    try {
      // Find the instructor ID for this exam
      let instructorId = activeExam.instructor_id || localStorage.getItem('active_instructor_id') || '';
      if (instructorId === 'null' || instructorId === 'undefined') {
        instructorId = '';
      }

      const res = await axios.post(`${API_BASE}/student/${currentUser.userId}/exams/${activeExam.exam_id}/submit`, {
        attempt_id: activeAttemptId,
        instructor_id: String(instructorId),
        disqualified: disqualifiedFlag
      }, getHeaders());

      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      setCameraStream(null);
      setCameraWarnings(0);
      setCameraActive(false);

      if (disqualifiedFlag) {
        alert(`🚨 DISQUALIFICATION: You have been disqualified from this exam due to proctoring webcam violations! Your score is recorded as 0%.`);
      } else {
        alert(`Exam submitted!\nScore: ${res.data.result.score}%\nFeedback: ${res.data.feedback}`);
      }
      setActiveExam(null);
      setActiveAttemptId(null);
      setView('student');
    } catch (err) {
      alert('Error submitting exam: ' + (err.response?.data?.error || err.message));
    }
  };

  // --- SUB-COMPONENTS / RENDER LAYOUTS ---

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="glow-container">
        <div className="glow-orb glow-orb-1"></div>
        <div className="glow-orb glow-orb-2"></div>
      </div>

      {currentUser && (
        <nav className="navbar animate-fade-in">
          <div className="nav-logo">
            <Award size={28} />
            <span>OnlineExam Portal</span>
          </div>
          <div className="nav-user" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="user-badge" style={{ textTransform: 'uppercase', fontWeight: 700 }}>{currentUser.role}</span>
            <span style={{ fontWeight: 600 }}>{currentUser.fullname}</span>
            <span style={{ fontSize: '0.85rem', padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary-light)', border: '1px solid rgba(99, 102, 241, 0.3)', fontWeight: 600 }}>
              ID: {currentUser.userId}
            </span>
            <button
              className="btn btn-secondary"
              onClick={toggleTheme}
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={16} style={{ color: '#f59e0b' }} /> : <Moon size={16} style={{ color: '#6366f1' }} />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '6px 12px' }}>
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </nav>
      )}

      {/* LOGIN VIEW */}
      {view === 'login' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '420px', position: 'relative' }}>
            <button
              className="btn btn-secondary"
              onClick={toggleTheme}
              style={{ position: 'absolute', top: '16px', right: '16px', padding: '6px 10px', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={14} style={{ color: '#f59e0b' }} /> : <Moon size={14} style={{ color: '#6366f1' }} />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div className="nav-logo" style={{ justifyContent: 'center', marginBottom: '8px' }}>
                <Award size={32} />
                <span style={{ fontSize: '1.6rem' }}>Exam Portal</span>
              </div>
              <p style={{ color: 'var(--text-secondary)' }}>Log in to access your dashboard</p>
            </div>

            {loginError && (
              <div style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.9rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="input-control"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  required
                  placeholder="Enter username"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  paddingRight: '12px',
                  width: '100%'
                }}>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      padding: '12px 16px',
                      fontSize: '0.95rem',
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                      width: '100%'
                    }}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px'
                    }}
                    title={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                <LogIn size={18} />
                <span>Log In</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN PORTAL */}
      {view === 'admin' && (
        <div className="animate-fade-in" style={{ flex: 1, padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users />
            <span>Admin Control Panel</span>
          </h2>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <button
              type="button"
              className={`btn ${adminTab === 'create' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAdminTab('create')}
            >
              <span>➕ Add New User</span>
            </button>
            <button
              type="button"
              className={`btn ${adminTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAdminTab('users')}
            >
              <span>👥 User Directory ({usersList.length})</span>
            </button>
            <button
              type="button"
              className={`btn ${adminTab === 'exams' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAdminTab('exams')}
            >
              <span>📝 Exam & Test Control ({adminExams.length})</span>
            </button>
          </div>

          {adminTab === 'create' && (
            <div className="glass-card animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem' }}>Add New User</h3>
              {regError && <div style={{ color: 'var(--error)', marginBottom: '12px' }}>{regError}</div>}
              {regSuccess && <div style={{ color: 'var(--success)', marginBottom: '12px' }}>{regSuccess}</div>}

              <form onSubmit={handleCreateUser}>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input type="text" className="input-control" value={regUser.username} onChange={e => setRegUser({ ...regUser, username: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    paddingRight: '12px',
                    width: '100%'
                  }}>
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        padding: '12px 16px',
                        fontSize: '0.95rem',
                        color: 'var(--text-primary)',
                        fontFamily: 'inherit',
                        width: '100%'
                      }}
                      value={regUser.password}
                      onChange={e => setRegUser({ ...regUser, password: e.target.value })}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px'
                      }}
                      title={showRegPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input type="text" className="input-control" value={regUser.fullname} onChange={e => setRegUser({ ...regUser, fullname: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="input-control" value={regUser.email} onChange={e => setRegUser({ ...regUser, email: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">User ID (Leave blank for auto-generated ID)</label>
                  <input type="text" className="input-control" value={regUser.userId} onChange={e => setRegUser({ ...regUser, userId: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="input-control" value={regUser.role} onChange={e => setRegUser({ ...regUser, role: e.target.value })}>
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  <UserPlus size={18} />
                  <span>Create User</span>
                </button>
              </form>
            </div>
          )}

          {adminTab === 'users' && (
            <div className="glass-card animate-fade-in">
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem' }}>Registered Users Directory</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '12px' }}>Name</th>
                      <th style={{ padding: '12px' }}>Username</th>
                      <th style={{ padding: '12px' }}>User ID</th>
                      <th style={{ padding: '12px' }}>Role</th>
                      <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map(u => (
                      <tr key={u._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px', fontWeight: 600 }}>{u.fullname}</td>
                        <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{u.username}</td>
                        <td style={{ padding: '12px' }}>{u.userId}</td>
                        <td style={{ padding: '12px' }}>
                          <span className="user-badge" style={{ backgroundColor: u.role === 'admin' ? 'rgba(239, 68, 68, 0.1)' : u.role === 'instructor' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255,255,255,0.05)' }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {u.userId !== currentUser.userId && (
                            <button
                              className="btn btn-danger"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => handleDeleteUser(u)}
                            >
                              Remove User
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {adminTab === 'exams' && (
            <div className="glass-card animate-fade-in">
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem' }}>All Ongoing & Finished Tests</h3>
              <div style={{ display: 'grid', gap: '15px' }}>
                {adminExams.map(ex => (
                  <div key={ex.exam_id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          {ex.exam_name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>(ID: {ex.exam_id})</span>
                        </h4>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                          Course ID: {ex.course_id} • Questions: {ex.questions?.length || 0} • Duration: {ex.duration}s
                        </p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Instructor ID: {ex.instructor_id}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {ex.is_active ? (
                          <span className="user-badge" style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)' }}>Ongoing / Active</span>
                        ) : (
                          <span className="user-badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>Finished / Inactive</span>
                        )}

                        {ex.is_active && (
                          <button
                            className="btn btn-warning"
                            style={{ padding: '6px 12px', fontSize: '0.85rem', backgroundColor: 'rgba(234, 179, 8, 0.15)', color: 'var(--warning)', border: '1px solid var(--warning)' }}
                            onClick={() => handleAdminStopExam(ex.exam_id)}
                          >
                            Stop Test
                          </button>
                        )}

                        <button
                          className="btn btn-danger"
                          style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                          onClick={() => handleAdminDeleteExam(ex.exam_id)}
                        >
                          Remove Test
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {adminExams.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No exams or tests found in system.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* INSTRUCTOR PORTAL */}
      {view === 'instructor' && (
        <div className="animate-fade-in" style={{ flex: 1, padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ marginBottom: '24px' }}>Instructor Dashboard</h2>

          {/* Instructor Navigation Tabs */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <button
              type="button"
              className={`btn ${instructorTab === 'build' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setInstructorTab('build')}
            >
              <span>🛠️ Build Exam & Questions</span>
            </button>
            <button
              type="button"
              className={`btn ${instructorTab === 'manage' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setInstructorTab('manage')}
            >
              <span>📋 Manage Exams & Evaluations ({exams.length})</span>
            </button>
            <button
              type="button"
              className={`btn ${instructorTab === 'eligibility' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setInstructorTab('eligibility')}
            >
              <span>🎓 Student Eligibility</span>
            </button>
          </div>

          {/* TAB 1: BUILD EXAM */}
          {instructorTab === 'build' && (
            <div className="glass-card animate-fade-in" style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Plus size={20} />
                  <span>Unified Exam & Question Builder</span>
                </div>
                {(() => {
                  const intendedTotal = parseInt(newExam.total_marks) || 0;
                  const combinedMarks = examQuestionsList.reduce((sum, q) => sum + (parseInt(q.marks) || 0), 0);
                  const isMatch = examQuestionsList.length > 0 && combinedMarks === intendedTotal;
                  return (
                    <span style={{ fontSize: '0.85rem', padding: '4px 12px', borderRadius: '20px', fontWeight: 700, backgroundColor: isMatch ? 'var(--success-bg)' : 'rgba(239, 68, 68, 0.15)', color: isMatch ? 'var(--success)' : 'var(--error)', border: `1px solid ${isMatch ? 'var(--success)' : 'var(--error)'}` }}>
                      Question Marks: {combinedMarks} / {intendedTotal} {isMatch ? '✓ Matched' : '⚠ Mismatch / Empty'}
                    </span>
                  );
                })()}
              </h3>

              <form onSubmit={handleCreateExam}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', marginBottom: '15px' }}>
                  <div className="form-group">
                    <label className="form-label">Course ID</label>
                    <input type="number" className="input-control" value={newExam.course_id} onChange={e => setNewExam({ ...newExam, course_id: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Exam Name</label>
                    <input type="text" className="input-control" value={newExam.exam_name} onChange={e => setNewExam({ ...newExam, exam_name: e.target.value })} required />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '15px' }}>
                  <label className="form-label">Description</label>
                  <textarea className="input-control" rows="2" value={newExam.description} onChange={e => setNewExam({ ...newExam, description: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '24px' }}>
                  <div className="form-group">
                    <label className="form-label">Duration (secs)</label>
                    <input type="number" className="input-control" value={newExam.duration} onChange={e => setNewExam({ ...newExam, duration: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total Marks (Intended)</label>
                    <input type="number" className="input-control" value={newExam.total_marks} onChange={e => setNewExam({ ...newExam, total_marks: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Passing %</label>
                    <input type="number" className="input-control" value={newExam.passing_marks} onChange={e => setNewExam({ ...newExam, passing_marks: e.target.value })} required />
                  </div>
                </div>

                {/* Dynamic Questions Builder Section */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                  <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '20px', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--primary)', marginBottom: '12px', fontWeight: 700, textTransform: 'uppercase' }}>
                      User Specification: Question Count & Type Setup
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', alignItems: 'end' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Mention Number of Questions</label>
                        <input
                          type="number"
                          className="input-control"
                          min="1"
                          max="50"
                          value={targetQuestionCount}
                          onChange={e => setTargetQuestionCount(Math.max(1, parseInt(e.target.value) || 1))}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Default Type of Questions</label>
                        <select
                          className="input-control"
                          value={defaultQuestionType}
                          onChange={e => setDefaultQuestionType(e.target.value)}
                        >
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="true_false">True/False</option>
                          <option value="short_answer">Short Answer</option>
                          <option value="essay">Essay</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ height: '42px' }}
                        onClick={() => {
                          const count = Math.max(1, targetQuestionCount);
                          const total = parseInt(newExam.total_marks) || 100;
                          const perQuestionMarks = Math.max(1, Math.floor(total / count));
                          const newList = Array.from({ length: count }, (_, i) => ({
                            question_text: '',
                            question_type: defaultQuestionType,
                            marks: perQuestionMarks,
                            options: ['', '', '', ''],
                            correct_answer: defaultQuestionType === 'true_false' ? 'true' : '0'
                          }));
                          setExamQuestionsList(newList);
                        }}
                      >
                        <span>Generate {targetQuestionCount} Question Slots</span>
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Editable Question Items ({examQuestionsList.length})</h4>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                      onClick={() => setExamQuestionsList([...examQuestionsList, { question_text: '', question_type: defaultQuestionType, marks: 10, options: ['', '', '', ''], correct_answer: '0' }])}
                    >
                      + Add Single Question
                    </button>
                  </div>

                  {examQuestionsList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', background: 'var(--bg-subbox)', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)' }}>
                      <p>No questions added yet. Use the setup bar above to generate slots or click "+ Add Single Question".</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '20px', marginBottom: '24px' }}>
                      {examQuestionsList.map((q, qIdx) => (
                        <div key={qIdx} style={{ background: 'var(--bg-subbox)', border: '1px solid var(--border-color)', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Question #{qIdx + 1}</span>
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={() => setExamQuestionsList(examQuestionsList.filter((_, idx) => idx !== qIdx))}
                            >
                              Remove Question
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '15px', marginBottom: '12px' }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Question Text</label>
                              <input
                                type="text"
                                className="input-control"
                                placeholder="Enter question prompt..."
                                value={q.question_text}
                                onChange={e => {
                                  const updated = [...examQuestionsList];
                                  updated[qIdx].question_text = e.target.value;
                                  setExamQuestionsList(updated);
                                }}
                                required
                              />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Question Type</label>
                              <select
                                className="input-control"
                                value={q.question_type}
                                onChange={e => {
                                  const updated = [...examQuestionsList];
                                  updated[qIdx].question_type = e.target.value;
                                  setExamQuestionsList(updated);
                                }}
                              >
                                <option value="multiple_choice">Multiple Choice</option>
                                <option value="true_false">True/False</option>
                                <option value="short_answer">Short Answer</option>
                                <option value="essay">Essay</option>
                              </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Marks</label>
                              <input
                                type="number"
                                className="input-control"
                                value={q.marks}
                                onChange={e => {
                                  const updated = [...examQuestionsList];
                                  updated[qIdx].marks = e.target.value;
                                  setExamQuestionsList(updated);
                                }}
                                required
                              />
                            </div>
                          </div>

                          {q.question_type === 'multiple_choice' && (
                            <div style={{ marginBottom: '12px' }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Options (4 choices)</label>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
                                {q.options.map((opt, oIdx) => (
                                  <input
                                    key={oIdx}
                                    type="text"
                                    placeholder={`Option ${oIdx + 1}`}
                                    className="input-control"
                                    style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                    value={opt}
                                    onChange={e => {
                                      const updated = [...examQuestionsList];
                                      updated[qIdx].options[oIdx] = e.target.value;
                                      setExamQuestionsList(updated);
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') && (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.8rem' }}>Correct Answer / Index</label>
                              <input
                                type="text"
                                className="input-control"
                                style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                placeholder={q.question_type === 'true_false' ? 'true / false' : '0, 1, 2, or 3'}
                                value={q.correct_answer}
                                onChange={e => {
                                  const updated = [...examQuestionsList];
                                  updated[qIdx].correct_answer = e.target.value;
                                  setExamQuestionsList(updated);
                                }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '10px' }}>
                  <span>Create Exam & Save All Questions</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: STUDENT ELIGIBILITY */}
          {instructorTab === 'eligibility' && (
            <div className="glass-card animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h3 style={{ marginBottom: '16px' }}>Assign Student Eligibility</h3>

              <div style={{ marginBottom: '20px', background: 'var(--bg-subbox)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 700 }}>Available Student User IDs</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {usersList.filter(u => u.role === 'student').map(s => (
                    <button
                      key={s._id}
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: '0.78rem', display: 'flex', gap: '6px', alignItems: 'center' }}
                      title={`Click to add ${s.fullname} (${s.email})`}
                      onClick={() => {
                        const current = eligibleStudentIds ? eligibleStudentIds.split(',').map(i => i.trim()).filter(Boolean) : [];
                        if (!current.includes(s.userId)) {
                          setEligibleStudentIds([...current, s.userId].join(', '));
                        }
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{s.fullname}</span>
                      <span style={{ background: 'var(--primary)', color: '#fff', padding: '1px 5px', borderRadius: '4px', fontSize: '0.75rem' }}>{s.userId}</span>
                    </button>
                  ))}
                  {usersList.filter(u => u.role === 'student').length === 0 && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No student accounts loaded.</span>
                  )}
                </div>
              </div>

              <form onSubmit={handleAddEligibility}>
                <div className="form-group">
                  <label className="form-label">Select Exam</label>
                  <select className="input-control" value={eligibilityExamId} onChange={e => setEligibilityExamId(e.target.value)}>
                    <option value="">-- Choose Exam --</option>
                    {exams.map(ex => (
                      <option key={ex.exam_id} value={ex.exam_id}>{ex.exam_name} (ID: {ex.exam_id})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Student User IDs (comma-separated)</label>
                  <input type="text" className="input-control" placeholder="e.g. USR-STU-001, USR-STU-002" value={eligibleStudentIds} onChange={e => setEligibleStudentIds(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  <span>Grant Eligibility</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: MANAGE EXAMS & EVALUATIONS */}
          {instructorTab === 'manage' && (
            <div className="animate-fade-in">
              {/* List Created Exams */}
              <div className="glass-card">
                <h3 style={{ marginBottom: '16px' }}>Manage Created Exams</h3>
                <div style={{ display: 'grid', gap: '15px' }}>
                  {exams.map(ex => (
                    <div key={ex.exam_id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'var(--bg-subbox)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ fontWeight: 700 }}>{ex.exam_name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>(ID: {ex.exam_id})</span></h4>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>Course ID: {ex.course_id} • Questions: {ex.questions.length} • Duration: {ex.duration}s</p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Eligible Students: {ex.eligible_students.join(', ') || 'None'}</p>
                        </div>
                        <div>
                          {ex.is_active ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className="user-badge" style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)' }}>Active</span>
                              <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => handleDeactivateExam(ex.exam_id)}>
                                <span>End Exam</span>
                              </button>
                            </div>
                          ) : (
                            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => handleActivateExam(ex.exam_id)}>
                              <span>Activate</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => { console.log('Edit Details Clicked:', ex); setEditingExam(ex); }}>
                          Edit Details
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => { console.log('View Attempts Clicked:', ex); handleFetchAttempts(ex); }}>
                          View Attempts & Scores
                        </button>
                      </div>
                    </div>
                  ))}
                  {exams.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No exams created yet.</p>}
                </div>
              </div>

              {/* Edit Exam Details Panel (Positioned Down Below) */}
              {editingExam && (
                <div className="glass-card animate-fade-in" style={{ marginTop: '30px', borderColor: 'var(--primary)' }}>
                  <h3 style={{ marginBottom: '16px' }}>Edit Exam Details (ID: {editingExam.exam_id})</h3>
                  <form onSubmit={handleUpdateExam}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="form-group">
                        <label className="form-label">Exam Name</label>
                        <input type="text" className="input-control" value={editingExam.exam_name} onChange={e => setEditingExam({ ...editingExam, exam_name: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Duration (seconds)</label>
                        <input type="number" className="input-control" value={editingExam.duration} onChange={e => setEditingExam({ ...editingExam, duration: e.target.value })} required />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Description</label>
                      <textarea className="input-control" rows="2" value={editingExam.description || ''} onChange={e => setEditingExam({ ...editingExam, description: e.target.value })} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                      <div className="form-group">
                        <label className="form-label">Total Marks</label>
                        <input type="number" className="input-control" value={editingExam.total_marks} onChange={e => setEditingExam({ ...editingExam, total_marks: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Passing Marks (%)</label>
                        <input type="number" className="input-control" value={editingExam.passing_marks} onChange={e => setEditingExam({ ...editingExam, passing_marks: e.target.value })} required />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingExam(null)}>Cancel</button>
                    </div>
                  </form>
                </div>
              )}

              {/* View & Evaluate Attempts Panel (Positioned Down Below) */}
              {viewingAttemptsExam && (
                <div className="glass-card animate-fade-in" style={{ marginTop: '30px', borderColor: 'var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3>Attempts & Manual Evaluation for {viewingAttemptsExam.exam_name}</h3>
                    <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => { setViewingAttemptsExam(null); setEvaluatingAttempt(null); }}>Close</button>
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {examAttempts.map(att => (
                      <div key={att.attempt_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'var(--bg-subbox)' }}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: '1.05rem' }}>{att.student_name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>({att.student_email})</span></p>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                            Attempt ID: {att.attempt_id} • Status:
                            {att.disqualified ? (
                              <span style={{ marginLeft: '6px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--error)' }}>
                                Disqualified
                              </span>
                            ) : (
                              <span style={{ marginLeft: '6px', textTransform: 'uppercase', fontWeight: 700, color: att.status === 'graded' ? 'var(--success)' : 'var(--warning)' }}>
                                {att.status}
                              </span>
                            )}
                            {att.violation_count > 0 && (
                              <span style={{ marginLeft: '12px', fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', background: att.violation_count >= 3 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: att.violation_count >= 3 ? 'var(--error)' : 'var(--warning)', fontWeight: 700 }}>
                                {att.violation_count >= 3 ? '🚨 HIGH VIOLATIONS: ' : '⚠️ VIOLATIONS: '} {att.violation_count}
                              </span>
                            )}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div>
                            {att.disqualified ? (
                              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--error)' }}>
                                0% (DISQ)
                              </span>
                            ) : (
                              <span style={{ fontSize: '1.3rem', fontWeight: 800, color: att.score >= viewingAttemptsExam.passing_marks ? 'var(--success)' : 'var(--error)' }}>
                                {att.score}%
                              </span>
                            )}
                          </div>
                          <button
                            className="btn btn-primary"
                            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                            onClick={() => handleStartEvaluation(att)}
                            disabled={att.disqualified}
                          >
                            📝 Evaluate / Grade
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                            onClick={() => handleGrantReattempt(att.student_id, viewingAttemptsExam.exam_id)}
                          >
                            🔄 Allow Reattempt
                          </button>
                        </div>
                      </div>
                    ))}
                    {examAttempts.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No attempts found for this exam.</p>}
                  </div>

                  {/* Interactive Evaluation Modal / Form */}
                  {evaluatingAttempt && (
                    <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '2px solid var(--primary-light)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h4 style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          Evaluating Student: {evaluatingAttempt.student_name} (Attempt #{evaluatingAttempt.attempt_id})
                        </h4>
                        <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setEvaluatingAttempt(null)}>Cancel Evaluation</button>
                      </div>

                      {/* Violation Logs Display */}
                      {evaluatingAttempt.violations && evaluatingAttempt.violations.length > 0 && (
                        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'rgba(239, 68, 68, 0.05)', marginBottom: '20px' }}>
                          <h5 style={{ fontWeight: 700, color: 'var(--error)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldAlert size={18} />
                            <span>Proctoring Violations Logged ({evaluatingAttempt.violation_count})</span>
                          </h5>
                          <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'grid', gap: '8px', fontSize: '0.85rem' }}>
                            {evaluatingAttempt.violations.map((v, vIdx) => (
                              <div key={vIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-card)', borderRadius: '4px', borderLeft: '3px solid var(--error)' }}>
                                <span style={{ fontWeight: 600 }}>{v.reason}</span>
                                <span style={{ color: 'var(--text-muted)' }}>{new Date(v.timestamp).toLocaleTimeString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <form onSubmit={handleSubmitEvaluation}>
                        <div style={{ display: 'grid', gap: '16px', marginBottom: '20px' }}>
                          {examQuestions.map((q, idx) => {
                            const qIdStr = String(q.question_id);
                            const studentAns = evaluatingAttempt.answers ? (evaluatingAttempt.answers[qIdStr] || (evaluatingAttempt.answers instanceof Map && evaluatingAttempt.answers.get(qIdStr)) || 'No answer submitted') : 'No answer submitted';
                            return (
                              <div key={q.question_id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'var(--bg-card)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                  <span style={{ fontWeight: 700 }}>Q{idx + 1}: {q.question_text} ({q.marks} Marks)</span>
                                  <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', fontWeight: 600 }}>{q.question_type}</span>
                                </div>
                                <div style={{ marginBottom: '12px', padding: '10px', background: 'var(--bg-subbox)', borderRadius: 'var(--radius-sm)', fontSize: '0.95rem' }}>
                                  <strong>Student Answer:</strong> <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{String(studentAns)}</span>
                                  {q.correct_answer && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Correct Reference Answer: {String(q.correct_answer)}</div>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Score Awarded:</label>
                                  <input
                                    type="number"
                                    min="0"
                                    max={q.marks}
                                    className="input-control"
                                    style={{ width: '120px', padding: '6px 10px' }}
                                    value={questionScores[qIdStr] !== undefined ? questionScores[qIdStr] : ''}
                                    onChange={e => setQuestionScores({ ...questionScores, [qIdStr]: e.target.value })}
                                    placeholder={`Max ${q.marks}`}
                                    required
                                  />
                                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>/ {q.marks} marks</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 700 }}>
                          Save & Finalize Evaluation
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* STUDENT PORTAL */}
      {view === 'student' && (
        <div className="animate-fade-in" style={{ flex: 1, padding: '40px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <h2 style={{ marginBottom: '24px' }}>Student Exam Dashboard</h2>
          {/* Student Navigation Tabs */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <button
              type="button"
              className={`btn ${studentTab === 'ongoing' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStudentTab('ongoing')}
            >
              <span>🔍 Live Ongoing Exams ({ongoingExams.length})</span>
            </button>
            <button
              type="button"
              className={`btn ${studentTab === 'take' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStudentTab('take')}
            >
              <span>📝 Search & Take Exam</span>
            </button>
            <button
              type="button"
              className={`btn ${studentTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStudentTab('history')}
            >
              <span>📊 My Attempt History ({studentAttempts.length})</span>
            </button>
          </div>

          {/* TAB 1: LIVE ONGOING EXAMS */}
          {studentTab === 'ongoing' && (
            <div className="glass-card animate-fade-in" style={{ marginBottom: '30px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} style={{ color: 'var(--primary)' }} />
                <span>All Ongoing Active Exams (Live Filter)</span>
              </h3>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Search ongoing exams by User ID, Exam Name, Course Code..."
                  value={ongoingFilter}
                  onChange={(e) => {
                    setOngoingFilter(e.target.value);
                    loadOngoingExams(e.target.value);
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                {ongoingExams.map(ex => (
                  <div key={ex.exam_id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'var(--bg-subbox)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ fontWeight: 700, color: 'var(--primary)' }}>{ex.exam_name}</h4>
                      <span className="user-badge" style={{ backgroundColor: 'var(--success-bg)', color: 'var(--success)' }}>Ongoing</span>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '6px 0' }}>Course Code: {ex.course_id} • Exam ID: {ex.exam_id}</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', wordBreak: 'break-all' }}>Instructor ID: {ex.instructor_id}</p>
                    <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem', marginTop: '12px', width: '100%' }} onClick={() => handleStartExam(ex, ex.instructor_id)}>
                      <Play size={14} />
                      <span>Attempt Ongoing Exam</span>
                    </button>
                  </div>
                ))}
                {ongoingExams.length === 0 && <p style={{ color: 'var(--text-secondary)', gridColumn: '1/-1' }}>No ongoing active exams matching your filter.</p>}
              </div>
            </div>
          )}

          {/* TAB 2: SEARCH & TAKE EXAM */}
          {studentTab === 'take' && (
            <div className="glass-card animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <BookOpen size={20} />
                <span>Search Available Exams by Instructor</span>
              </h3>
              <div className="form-group">
                <label className="form-label">Enter Instructor User ID</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input type="text" id="search-instructor-id" className="input-control" style={{ flex: 1 }} placeholder="e.g. USR-INS-001" />
                  <button className="btn btn-primary" onClick={() => {
                    const instId = document.getElementById('search-instructor-id').value;
                    localStorage.setItem('active_instructor_id', instId);
                    handleQueryAvailableExams(instId);
                  }}>
                    Search
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
                {availableExams.map(ex => (
                  <div key={ex.exam_id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'var(--bg-subbox)' }}>
                    <h4 style={{ fontWeight: 700 }}>{ex.exam_name}</h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '6px 0' }}>{ex.description}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Duration: {ex.duration}s</span>
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }} onClick={() => handleStartExam(ex, localStorage.getItem('active_instructor_id'))}>
                        <Play size={14} />
                        <span>Start Exam</span>
                      </button>
                    </div>
                  </div>
                ))}
                {availableExams.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No search results. Enter an instructor ID above.</p>}
              </div>
            </div>
          )}

          {/* TAB 3: MY ATTEMPT HISTORY */}
          {studentTab === 'history' && (
            <div className="glass-card animate-fade-in">
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} />
                <span>My Exam Attempt History</span>
              </h3>
              <div style={{ display: 'grid', gap: '15px' }}>
                {studentAttempts.map(att => (
                  <div key={att.attempt_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px', background: 'var(--bg-subbox)' }}>
                    <div>
                      <h4 style={{ fontWeight: 600 }}>Exam ID: {att.exam_id}</h4>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                        Attempt ID: {att.attempt_id} • Status:
                        {att.disqualified ? (
                          <span style={{ marginLeft: '6px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--error)' }}>
                            Disqualified
                          </span>
                        ) : (
                          <span style={{ marginLeft: '6px', textTransform: 'uppercase', fontWeight: 700, color: att.status === 'graded' ? 'var(--success)' : 'var(--warning)' }}>
                            {att.status === 'submitted' ? 'Pending Instructor Evaluation' : att.status}
                          </span>
                        )}
                      </p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Started: {new Date(att.start_time).toLocaleString()}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {att.disqualified ? (
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
                          DISQUALIFIED
                        </span>
                      ) : att.status === 'graded' ? (
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: att.score >= 40 ? 'var(--success)' : 'var(--error)' }}>
                          {att.score}%
                        </span>
                      ) : (
                        <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--warning)', background: 'rgba(234, 179, 8, 0.1)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
                          Evaluation Pending
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {studentAttempts.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No exam attempts completed yet.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE EXAM RUNNER */}
      {view === 'exam-runner' && activeExam && (
        <div className="animate-fade-in" style={{ flex: 1, padding: '40px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
          {/* Floating Camera Preview Overlay */}
          {cameraStream && (
            <div style={{ position: 'fixed', bottom: '20px', right: '20px', width: '180px', height: '135px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: cameraActive ? '3px solid var(--primary)' : '3px solid var(--error)', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', zIndex: 1000, background: '#000' }}>
              <video
                ref={el => { if (el && cameraStream) el.srcObject = cameraStream; }}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{ position: 'absolute', top: '5px', left: '5px', padding: '2px 6px', background: cameraActive ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: '4px', textTransform: 'uppercase' }}>
                {cameraActive ? 'Live Proctor' : 'Off'}
              </div>
            </div>
          )}

          <div className="glass-card" style={{ padding: '30px' }}>
            {/* Camera Warning Banner */}
            {!cameraActive && (
              <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: '20px', fontWeight: 700, border: '1px solid var(--error)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldAlert size={20} />
                <span>🚨 WEBCAM INACTIVE: Please enable/unblock your camera! Warning {cameraWarnings} of 3. You will be disqualified if not resolved.</span>
              </div>
            )}
            {/* Header / Info Panel */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '24px' }}>
              <div>
                <h2>{activeExam.exam_name}</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Total Questions: {activeExam.total_questions} • Max Marks: {activeExam.total_marks}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--error-bg)', color: 'var(--error)', padding: '10px 16px', borderRadius: 'var(--radius-md)', fontWeight: 700 }}>
                <Clock size={20} />
                <span>{Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}</span>
              </div>
            </div>

            {/* Questions List */}
            <div style={{ display: 'grid', gap: '24px' }}>
              {activeExam.questions.map((q, idx) => (
                <div key={q.question_id} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '20px', background: 'var(--bg-subbox)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Question {idx + 1}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{q.marks} Marks</span>
                  </div>
                  <p style={{ fontSize: '1.05rem', fontWeight: 500, marginBottom: '16px' }}>{q.question_text}</p>

                  {/* Multiple Choice Options */}
                  {q.question_type === 'multiple_choice' && (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {Object.entries(q.options).map(([key, optText]) => (
                        <label
                          key={key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                            background: studentAnswers[q.question_id] === key ? 'rgba(99,102,241,0.08)' : 'transparent',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="radio"
                            name={`q_${q.question_id}`}
                            value={key}
                            checked={studentAnswers[q.question_id] === key}
                            onChange={() => handleAnswerSubmit(q.question_id, key)}
                          />
                          <span>{optText}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* True / False Options */}
                  {q.question_type === 'true_false' && (
                    <div style={{ display: 'flex', gap: '20px' }}>
                      {['true', 'false'].map(val => (
                        <label
                          key={val}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justify: 'center', gap: '10px',
                            padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                            background: studentAnswers[q.question_id] === val ? 'rgba(99,102,241,0.08)' : 'transparent',
                            cursor: 'pointer', textTransform: 'capitalize'
                          }}
                        >
                          <input
                            type="radio"
                            name={`q_${q.question_id}`}
                            value={val}
                            checked={studentAnswers[q.question_id] === val}
                            onChange={() => handleAnswerSubmit(q.question_id, val)}
                          />
                          <span>{val}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Free Text Answers */}
                  {(q.question_type === 'short_answer' || q.question_type === 'essay') && (
                    <textarea
                      className="input-control"
                      style={{ width: '100%', resize: 'vertical' }}
                      rows={q.question_type === 'essay' ? 6 : 2}
                      placeholder="Type your response here..."
                      value={studentAnswers[q.question_id] || ''}
                      onChange={e => setStudentAnswers({ ...studentAnswers, [q.question_id]: e.target.value })}
                      onBlur={e => handleAnswerSubmit(q.question_id, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Submission Block */}
            <button className="btn btn-primary" style={{ width: '100%', marginTop: '30px', padding: '16px' }} onClick={() => handleExamSubmit(false)}>
              <span>Submit Exam Paper</span>
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ marginTop: 'auto', padding: '24px', textAlign: 'center', borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <span>&copy; 2026 Online Exam System. All Rights Reserved.</span>
      </footer>
    </div>
  );
}
