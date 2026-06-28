# 📚 Moodle-Integrated Online Exam System (MERN Stack)

Welcome to the **Moodle-Integrated Online Exam System**. This repository houses a complete, multi-role web application designed to facilitate online examinations, automated grading, dynamic question management, and integration with Moodle services.

---

## 📋 Table of Contents
1. [Project Architecture](#-project-architecture)
2. [Directory Breakdown](#-directory-breakdown)
3. [Pre-configured Demo Accounts](#-pre-configured-demo-accounts)
4. [Backend API Routes](#-backend-api-routes)
5. [Database Models](#-database-models)
6. [Frontend Features](#-frontend-features)
7. [Environment Variables](#️-environment-variables)
8. [Installation & Setup](#-installation--setup)

---

## 🏗️ Project Architecture

```
+-------------------------------------------------------------+
|                        React Frontend                       |
|         (Vite, Dynamic Dashboards, Real-time Timer)         |
+------------------------------+------------------------------+
                               | REST API (HTTP / JSON)
                               v
+-------------------------------------------------------------+
|                     Express.js Backend                      |
|           (JWT Auth, Controllers, Moodle Client)            |
+------------------+-----------------------+------------------+
                   |                       |
                   v                       v
     +--------------------------+  +--------------------------+
     |     MongoDB Database     |  |     Moodle REST API      |
     | (Users, Exams, Attempts) |  |   (Course & User Sync)   |
     +--------------------------+  +--------------------------+
```

* **Frontend**: React 19, Vite, Lucide React, Custom CSS.
* **Backend**: Node.js, Express.js, JWT, BcryptJS.
* **Database**: MongoDB (Object Data Modeling via Mongoose).
* **Integration**: Moodle Web Services API (`core_user_get_users`, `core_course_get_courses`, etc.).

---

## 📂 Directory Breakdown

```text
mern-app/
├── backend/
│   ├── config/
│   │   └── db.js            # MongoDB connection logic & user auto-seeding
│   ├── controllers/
│   │   ├── admin.js         # User administration & global exam management handlers
│   │   ├── auth.js          # Authentication (login/register) handlers
│   │   ├── instructor.js    # Exam creation, question management, student enrollment handlers
│   │   └── student.js       # Exam attempt, answer submission, timer, auto-grading handlers
│   ├── middleware/
│   │   └── auth.js          # JWT verification & role authorization middleware
│   ├── models/
│   │   ├── Attempt.js       # Mongoose schema for student exam attempts
│   │   ├── Exam.js          # Mongoose schema for exams and embedded questions
│   │   └── User.js          # Mongoose schema for user accounts with password hashing
│   ├── moodle_api/
│   │   └── client.js        # Moodle API web service request client wrapper
│   ├── .env                 # Backend environment configuration
│   ├── app.js               # Express application entry point & API endpoints
│   └── users.json           # Default seed user dataset
└── frontend/
    ├── src/
    │   ├── App.jsx          # Main React component containing role dashboards
    │   ├── App.css          # Core application component styling
    │   ├── index.css        # Global CSS Reset & utility styles
    │   └── main.jsx         # Application mounting point
    ├── package.json         # Frontend dependencies & scripts
    └── vite.config.js       # Vite build setup
```

---

## 👥 Pre-configured Demo Accounts

When the backend starts, it checks MongoDB and automatically seeds the following credentials from `users.json`:

| Role | Username | Password | User ID | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `adminpassword` | `1` | Full administrative permissions |
| **Instructor** | `instructor1` | `instructorpassword` | `2` | Exam builder & grader account |
| **Student** | `student1` | `studentpassword` | `3` | Eligible exam candidate |
| **Student** | `student2` | `studentpassword` | `4` | Eligible exam candidate |

---

## 🔌 Backend API Routes

### 🔓 Auth & Public
* `POST /api/auth/login` - User authentication & JWT token generation.
* `POST /api/auth/register` - User registration.
* `GET /health` - Health check status.

### 👑 Admin Endpoints (Protected: `admin`)
* `GET /api/admin/users` - Fetch list of all registered users.
* `POST /api/admin/users` - Register a new user with a specific role.
* `DELETE /api/admin/users/:user_id` - Delete a user account.
* `GET /api/admin/exams` - Fetch all exams across the system.
* `PUT /api/admin/exams/:exam_id/stop` - Force stop/deactivate an active exam.
* `DELETE /api/admin/exams/:exam_id` - Delete an exam.

### 👨‍🏫 Instructor Endpoints
* `POST /api/instructor/init` - Initialize instructor workspace.
* `GET /api/instructor/:instructor_id/exams` - List instructor's exams.
* `POST /api/instructor/:instructor_id/exams` - Create a new exam.
* `GET /api/instructor/:instructor_id/exams/:exam_id` - Fetch details for a specific exam.
* `PUT /api/instructor/:instructor_id/exams/:exam_id` - Update exam metadata.
* `GET /api/instructor/:instructor_id/exams/:exam_id/questions` - List questions belonging to an exam.
* `POST /api/instructor/:instructor_id/exams/:exam_id/questions` - Add question to an exam.
* `POST /api/instructor/:instructor_id/exams/:exam_id/students` - Assign eligible students to an exam.
* `PUT /api/instructor/:instructor_id/exams/:exam_id/activate` - Publish/activate exam.
* `PUT /api/instructor/:instructor_id/exams/:exam_id/deactivate` - Unpublish/deactivate exam.
* `GET /api/instructor/:instructor_id/exams/:exam_id/attempts` - View student submission attempts and scores.

### 🎓 Student Endpoints
* `POST /api/student/init` - Initialize student dashboard.
* `GET /api/student/exams/ongoing` - Fetch all currently ongoing/active exams.
* `POST /api/student/:student_id/exams/available` - Fetch available active exams for the student.
* `POST /api/student/:student_id/exams/:exam_id/start` - Start an exam attempt.
* `POST /api/student/:student_id/exams/:exam_id/submit-answer` - Save individual answer.
* `GET /api/student/:student_id/exams/:exam_id/time-remaining` - Get remaining exam timer seconds.
* `POST /api/student/:student_id/exams/:exam_id/submit` - Finalize exam submission and calculate score.
* `GET /api/student/:student_id/attempts` - View past attempt history.

---

## 🗄️ Database Models

1. **User Schema (`User.js`)**
   * Fields: `username`, `password` (bcrypt hashed), `role` (`admin` | `instructor` | `student`), `fullname`, `email`, `userId`.
2. **Exam Schema (`Exam.js`)**
   * Fields: `exam_id`, `course_id`, `exam_name`, `description`, `instructor_id`, `duration`, `total_marks`, `passing_marks`, `questions` (Array of question objects), `eligible_students`, `is_active`.
3. **Attempt Schema (`Attempt.js`)**
   * Fields: `attempt_id`, `student_id`, `exam_id`, `start_time`, `end_time`, `answers` (Map), `score`, `status` (`in_progress` | `submitted` | `graded`).

---

## 🖥️ Frontend Features

* **Role-Based Views**: Dynamic rendering of tailored interfaces depending on the logged-in user's role.
* **Exam Management Builder**: Easy-to-use forms for instructors to configure exams and attach questions.
* **Interactive Exam Runner**: Includes single/multiple choice options, live status banners, timer enforcement, and instant evaluation.

---

## ⚙️ Environment Variables

The backend relies on the following environment variables (configured in `backend/.env`):

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/exam_system
JWT_SECRET=supersecretjwtkey-change-this-in-production
USERS_FILE_PATH=./users.json
MOODLE_URL=http://localhost/moodle
MOODLE_TOKEN=your_moodle_api_token_here
EXAM_TIME_LIMIT=3600
MAX_QUESTIONS_PER_EXAM=50
PASSING_SCORE=60
```

---

## 🚀 Installation & Setup

### Prerequisites
* **Node.js**: v18 or later installed.
* **MongoDB**: Running locally on `mongodb://127.0.0.1:27017` or a cloud MongoDB URI in `.env`.

### 1. Backend Startup
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Run backend in development mode (starts server on http://localhost:5000)
npm run dev
```

### 2. Frontend Startup
```bash
# Open a new terminal and navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite dev server (starts frontend on http://localhost:5173)
npm run dev
``` 
