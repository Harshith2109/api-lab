# 📚 Moodle-Integrated Online Exam System with Proctoring (MERN Stack)

Welcome to the **Moodle-Integrated Online Exam System**. This repository houses a complete, multi-role web application designed to facilitate online examinations, automated grading, manual instructor grading, dynamic question management, Moodle API course synchronization, and a client-server exam proctoring suite.

---

## 📋 Table of Contents
1. [Project Architecture](#🏗️-project-architecture)
2. [Directory Breakdown](#📂-directory-breakdown)
3. [Pre-configured Demo Accounts](#👥-pre-configured-demo-accounts)
4. [Proctoring Engine & Disqualification](#🛡️-proctoring-engine--disqualification)
5. [Moodle REST API Integration](#🔌-moodle-rest-api-integration)
6. [Backend API Routes](#🔌-backend-api-routes)
7. [Database Models](#🗄️-database-models)
8. [Environment Variables](#⚙️-environment-variables)
9. [Installation & Setup](#🚀-installation--setup)

---

## 🏗️ Project Architecture

```
+-------------------------------------------------------------------+
|                           React Frontend                          |
|         (Vite, Floating Webcam Overlay, Proctoring Hook)          |
+---------------------------------+---------------------------------+
                                  | REST API (HTTP / JSON)
                                  v
+-------------------------------------------------------------------+
|                        Express.js Backend                         |
|            (JWT Auth, Proctoring Violations, Moodle Client)       |
+-----------------+-----------------------+-------------------------+
                  |                       |
                  v                       v
    +--------------------------+  +--------------------------+
    |     MongoDB Database     |  |     Moodle REST API      |
    | (Users, Exams, Attempts) |  |   (Course & User Sync)   |
    +--------------------------+  +--------------------------+
```

* **Frontend**: React 19, Vite, Lucide React icons, Vanilla CSS.
* **Backend**: Node.js, Express.js, JWT, BcryptJS.
* **Database**: MongoDB (Object Data Modeling via Mongoose).
* **Integration**: Moodle Web Services REST API.
* **Proctoring**: Native Browser APIs (Page Visibility, HTML5 Fullscreen) and WebRTC Camera Capture.

---

## 📂 Directory Breakdown

```text
mern-app/
├── backend/
│   ├── config/
│   │   └── db.js            # MongoDB connection logic & user auto-seeding
│   ├── controllers/
│   │   ├── admin.js         # User administration & global exam management
│   │   ├── auth.js          # Authentication (login/register) handlers
│   │   ├── instructor.js    # Exam builder, reattempts, manual grading handlers
│   │   └── student.js       # Exam attempt execution, proctoring violations handlers
│   ├── middleware/
│   │   └── auth.js          # JWT verification & role authorization middleware
│   ├── models/
│   │   ├── Attempt.js       # Student exam attempt schema with violations
│   │   ├── Exam.js          # Exam configurations & nested questions schema
│   │   └── User.js          # User account schema with password hashing
│   ├── moodle_api/
│   │   └── client.js        # Moodle API Rest client class
│   ├── .env                 # Backend environment configuration
│   ├── app.js               # Express application routes & server entry point
│   └── users.json           # Default seed user credentials
└── frontend/
    ├── src/
    │   ├── App.jsx          # Main React component containing dashboards
    │   ├── App.css          # Core CSS stylesheet
    │   ├── index.css        # Global layout styling
    │   └── main.jsx         # App mounting point
    ├── package.json         # React packages & build configuration
    └── vite.config.js       # Vite compile configuration
```

---

## 👥 Pre-configured Demo Accounts

When the backend starts, it automatically seeds the following credentials from `users.json`:

| Role | Username | Password | User ID | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `adminpassword` | `USR-ADM-001` | Full administrative control |
| **Instructor** | `instructor1` | `instructorpassword` | `USR-INS-001` | Exam builder & manual grader account |
| **Student** | `student1` | `studentpassword` | `USR-STU-001` | Candidate profile |
| **Student** | `student2` | `studentpassword` | `USR-STU-002` | Candidate profile |

---

## 🛡️ Proctoring Engine & Disqualification

The application features a custom, native client-side proctoring engine that enforces a strict exam environment:

1. **Webcam Enforcement & Overlay**:
   * Prompts the student for webcam access immediately upon exam startup.
   * Renders a floating corner video preview of the student's live feed with a green `"LIVE PROCTOR"` / red `"OFF"` status badge.
   * Runs a recurring 5-second validation loop checking whether the webcam track remains active, unblocked, and enabled.
2. **Page Visibility Monitoring**:
   * Uses the **Page Visibility API** to track tab switching, window minimization, or loss of focus. Logs each event with a warning.
3. **Programmatic Fullscreen Enforcement**:
   * Requests HTML5 fullscreen promotion directly during the click gesture when starting the exam.
   * Detects exits from fullscreen via `fullscreenchange` event listeners, alerts the user, and demands they return to fullscreen.
4. **Automated Warning & Disqualification**:
   * Tab-switches, fullscreen exits, and camera dropouts count towards a **Warning Threshold**.
   * On the 3rd warning, the client immediately terminates the exam and calls the auto-disqualification API.
   * Disqualified attempts are locked with a **`0%` score** and flagged as `disqualified: true` in Mongoose. Instructors can see a detail log of the student's violations (timestamp and reason) in their dashboard.

---

## 🔌 Moodle REST API Integration

The backend interacts dynamically with Moodle REST Web Services using the following functions:

1. **`core_user_get_users`**:
   * Triggered when a student starts an exam. Synchronizes the student's full name and email from Moodle directly into the local MERN database profile.
2. **`core_enrol_get_enrolled_users`**:
   * Called to check student eligibility. If the student is not explicitly whitelisted in the local exam configuration, the backend queries Moodle to check if the student is currently enrolled in the matching course category before granting access.
3. **`core_course_get_courses`**:
   * Used during exam creation. Validates that the instructor's entered `course_id` matches an existing course category index inside Moodle.

---

## 🔌 Backend API Routes

### 🔓 Auth & Public
* `POST /api/auth/login` - User login.
* `POST /api/auth/register` - User registration.
* `GET /health` - Health status check.

### 👑 Admin (Protected: `admin` role)
* `GET /api/admin/users` - Fetch list of registered users.
* `POST /api/admin/users` - Create user.
* `DELETE /api/admin/users/:user_id` - Delete user account.
* `GET /api/admin/exams` - Fetch all exams.
* `PUT /api/admin/exams/:exam_id/stop` - Force deactivate/end an active exam.
* `DELETE /api/admin/exams/:exam_id` - Delete exam.

### 👨‍🏫 Instructor (Protected: `instructor` role)
* `POST /api/instructor/init` - Initialize instructor workspace.
* `GET /api/instructor/:instructor_id/exams` - List exams created by the instructor.
* `POST /api/instructor/:instructor_id/exams` - Create a new exam.
* `GET /api/instructor/:instructor_id/exams/:exam_id` - Fetch exam details.
* `PUT /api/instructor/:instructor_id/exams/:exam_id` - Update exam metadata.
* `GET /api/instructor/:instructor_id/exams/:exam_id/questions` - List exam questions.
* `POST /api/instructor/:instructor_id/exams/:exam_id/questions` - Add question.
* `POST /api/instructor/:instructor_id/exams/:exam_id/students` - Whitelist eligible student IDs.
* `PUT /api/instructor/:instructor_id/exams/:exam_id/activate` - Activate exam.
* `PUT /api/instructor/:instructor_id/exams/:exam_id/deactivate` - Deactivate exam.
* `GET /api/instructor/:instructor_id/exams/:exam_id/attempts` - View student exam attempts, scores, and violation logs.
* `POST /api/instructor/:instructor_id/exams/:exam_id/reattempt` - Authorize student for a reattempt.
* `PUT /api/instructor/:instructor_id/exams/:exam_id/attempts/:attempt_id/grade` - Submit manual grading score cards for open-ended questions.

### 🎓 Student (Protected: `student` role)
* `POST /api/student/init` - Initialize student dashboard.
* `GET /api/student/exams/ongoing` - Fetch active exams list matching a search filter.
* `POST /api/student/:student_id/exams/available` - Query available exams.
* `POST /api/student/:student_id/exams/:exam_id/start` - Start exam session (verifies eligibility and starts tracking).
* `POST /api/student/:student_id/exams/:exam_id/submit-answer` - Submit answer for a question.
* `GET /api/student/:student_id/exams/:exam_id/time-remaining` - Get remaining exam timer seconds.
* `POST /api/student/:student_id/exams/:exam_id/submit` - Submit exam (evaluates multiple choice / true-false, or registers disqualified state).
* `GET /api/student/:student_id/attempts` - View past attempt history.
* `POST /api/student/:student_id/exams/:exam_id/violation` - Log a proctoring infraction in real-time.

---

## 🗄️ Database Models

### 1. User Model (`User.js`)
* Fields: `username`, `password` (bcrypt hashed), `role` (`admin` | `instructor` | `student`), `fullname`, `email`, `userId` (unique).

### 2. Exam Model (`Exam.js`)
* Fields: `exam_id` (unique), `course_id`, `exam_name`, `description`, `instructor_id`, `duration`, `total_marks`, `passing_marks`, `questions` (Array of nested question objects), `eligible_students` (Array), `reattempt_students` (Array), `is_active`.

### 3. Attempt Model (`Attempt.js`)
* Fields: `attempt_id` (unique), `student_id`, `exam_id`, `start_time`, `end_time`, `answers` (Map), `question_scores` (Map), `score`, `status` (`in_progress` | `submitted` | `graded`), `violations` (Array of objects recording timestamp and reason), `violation_count` (Number), `disqualified` (Boolean).

---

## ⚙️ Environment Variables

Configure these variables inside `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/examdb
JWT_SECRET=supersecretjwtkey12345
MOODLE_URL=http://localhost/moodle
MOODLE_TOKEN=your_moodle_api_token_here
```

*(Note: If the Moodle token remains set to `your_moodle_token_here` or left blank, the Moodle integration automatically resolves graceful fallbacks silently to prevent logs from spamming).*

---

## 🚀 Installation & Setup

### Prerequisites
* **Node.js**: version v18 or later.
* **MongoDB**: local instance running on `mongodb://127.0.0.1:27017`.

### 1. Start backend server
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Run backend development server (starts on http://localhost:5000)
npm run dev
```

### 2. Start frontend server
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite dev compilation server (starts on http://localhost:5173)
npm run dev
```
