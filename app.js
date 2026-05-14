const express = require("express");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const { exec } = require("child_process");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const DATABASE_PATH = path.join(DATA_DIR, "database.db");
const HTML_DIR = path.join(__dirname, "html");
const CSS_DIR = path.join(__dirname, "css");
const SCRIPT_PATH = path.join(__dirname, "script.js");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const AUTH_COOKIE_NAME = "jiruedu_session";
const AUTH_SECRET = process.env.AUTH_SECRET || "jiruedu-dev-secret";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const USE_SECURE_COOKIES = process.env.NODE_ENV === "production";
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 50;
const PASSWORD_MIN_LENGTH = 8;
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const SUBJECT_ID_MIN_LENGTH = 2;
const SUBJECT_ID_MAX_LENGTH = 40;
const AVAILABLE_GRADE_LEVELS = [
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12"
];
const LOGIN_ROLE_VALUES = new Set(["student", "teacher", "admin", "system_admin"]);
const MANAGED_ROLE_VALUES = new Set(["student", "teacher", "parent", "admin", "system_admin"]);
const SCHOOL_MANAGED_ROLES = new Set(["student", "teacher", "parent"]);
const ROLE_PERMISSIONS = {
  student: [
    "view_assigned_subjects",
    "complete_lessons",
    "take_quizzes",
    "upload_homework",
    "view_progress"
  ],
  teacher: [
    "view_assigned_subjects",
    "edit_assigned_content",
    "schedule_quizzes",
    "monitor_student_performance",
    "publish_support_notes"
  ],
  admin: [
    "manage_school_users",
    "edit_curriculum_content",
    "view_school_reports",
    "review_assignments"
  ],
  system_admin: [
    "manage_all_roles",
    "view_audit_trail",
    "create_backups",
    "manage_backend_configuration"
  ]
};
const QUESTION_TYPES = new Set(["multiple_choice", "true_false", "short_answer"]);
const DEFAULT_AI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const SEEDED_CONTENT = [
  {
    id: "mathematics",
    name: "Mathematics",
    summary: "Build confidence with variables, equations, and simple problem solving.",
    sortOrder: 1,
    lesson: {
      title: "Introduction to Variables",
      grade: "Grade 10",
      imageLabel: "Variables and equations",
      paragraphs: [
        "A variable is a letter or symbol that stands for a value we do not know yet.",
        "Variables help us describe patterns and write equations in a short, reusable way.",
        "If x + 2 = 5, then x is the unknown value. Solving the equation tells us that x = 3."
      ]
    },
    quiz: [
      {
        prompt: "What is the value of x if 2x + 4 = 10?",
        options: ["2", "3", "4", "5"],
        answerIndex: 1
      },
      {
        prompt: "Which expression means three more than a number n?",
        options: ["3n", "n - 3", "n + 3", "3 - n"],
        answerIndex: 2
      },
      {
        prompt: "If y = 7, what is y - 2?",
        options: ["3", "4", "5", "9"],
        answerIndex: 2
      },
      {
        prompt: "Which equation has the solution x = 6?",
        options: ["x + 1 = 6", "x - 2 = 4", "2x = 8", "x / 3 = 1"],
        answerIndex: 1
      }
    ]
  },
  {
    id: "english",
    name: "English",
    summary: "Practice reading comprehension and identifying the main idea in a passage.",
    sortOrder: 2,
    lesson: {
      title: "Finding the Main Idea",
      grade: "Grade 10",
      imageLabel: "Reading and analysis",
      paragraphs: [
        "The main idea is the central message or most important point in a paragraph or passage.",
        "Supporting details explain, prove, or expand the main idea for the reader.",
        "A good reader asks: what is this paragraph mostly about, and what does the writer want me to understand?"
      ]
    },
    quiz: [
      {
        prompt: "What does the main idea tell the reader?",
        options: [
          "The smallest detail in the text",
          "The most important point of the text",
          "The title of the story",
          "The name of the author"
        ],
        answerIndex: 1
      },
      {
        prompt: "Which sentence is most likely a supporting detail?",
        options: [
          "Exercise keeps the body healthy.",
          "Many students play basketball after class.",
          "The passage is about teamwork.",
          "The article teaches a lesson."
        ],
        answerIndex: 1
      },
      {
        prompt: "Why is identifying the main idea useful?",
        options: [
          "It helps readers understand the text quickly.",
          "It replaces the need to read carefully.",
          "It tells readers the page number.",
          "It makes every answer true."
        ],
        answerIndex: 0
      },
      {
        prompt: "Which part of a paragraph usually supports the main idea?",
        options: [
          "The details and examples",
          "The page border",
          "The punctuation only",
          "The paragraph number"
        ],
        answerIndex: 0
      }
    ]
  },
  {
    id: "science",
    name: "Science",
    summary: "Explore ecosystems, food chains, and how living things depend on each other.",
    sortOrder: 3,
    lesson: {
      title: "Understanding Ecosystems",
      grade: "Grade 10",
      imageLabel: "Ecosystem relationships",
      paragraphs: [
        "An ecosystem includes living things, nonliving things, and the interactions between them.",
        "Plants are producers because they make their own food using sunlight, water, and carbon dioxide.",
        "Consumers depend on plants or other animals for food, which is why balance in an ecosystem matters."
      ]
    },
    quiz: [
      {
        prompt: "Which organism is a producer in a food chain?",
        options: ["Rabbit", "Grass", "Hawk", "Mushroom"],
        answerIndex: 1
      },
      {
        prompt: "What is an ecosystem?",
        options: [
          "Only the animals in a place",
          "A single food source",
          "Living and nonliving things interacting together",
          "A weather report"
        ],
        answerIndex: 2
      },
      {
        prompt: "Why are plants important in ecosystems?",
        options: [
          "They remove all water from the soil.",
          "They produce food for themselves and other organisms.",
          "They only live underground.",
          "They stop energy from moving."
        ],
        answerIndex: 1
      },
      {
        prompt: "Which factor is nonliving?",
        options: ["Tree", "Bird", "Sunlight", "Frog"],
        answerIndex: 2
      }
    ]
  },
  {
    id: "social-studies",
    name: "Social Studies",
    summary: "Learn how communities grow and how people contribute to civic life.",
    sortOrder: 4,
    lesson: {
      title: "Roles in a Community",
      grade: "Grade 10",
      imageLabel: "Community roles",
      paragraphs: [
        "A community is a group of people living or working together in the same area.",
        "Different people serve different roles such as teachers, health workers, local leaders, and business owners.",
        "Communities grow stronger when people cooperate, follow rules, and support shared goals."
      ]
    },
    quiz: [
      {
        prompt: "What is one reason communities need rules?",
        options: [
          "To make life more confusing",
          "To help people live together safely and fairly",
          "To stop all changes",
          "To remove all responsibilities"
        ],
        answerIndex: 1
      },
      {
        prompt: "Which person is most directly involved in community health?",
        options: ["Doctor", "Carpenter", "Driver", "Singer"],
        answerIndex: 0
      },
      {
        prompt: "What helps a community become stronger?",
        options: [
          "Ignoring shared problems",
          "Working together toward common goals",
          "Avoiding every discussion",
          "Removing local services"
        ],
        answerIndex: 1
      },
      {
        prompt: "A community is best described as:",
        options: [
          "Only a school building",
          "A group of people connected by a place or shared activity",
          "A list of rules",
          "A single family only"
        ],
        answerIndex: 1
      }
    ]
  }
];

const PUBLIC_PAGES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/login.html", "login.html"],
  ["/signup.html", "signup.html"]
]);

const STUDENT_PAGES = [
  "/student_dashboard.html",
  "/subject.html",
  "/lesson.html",
  "/quiz.html",
  "/progress.html",
  "/homework_upload.html"
];

const ADMIN_PAGES = ["/admindash.html", "/adminrev.html"];
const TEACHER_PAGES = ["/teacherdash.html"];
const SYSTEM_ADMIN_PAGES = ["/sysadmindash.html"];
const loginAttemptTracker = new Map();

const app = express();
const db = new sqlite3.Database(DATABASE_PATH);

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use("/css", express.static(CSS_DIR));
app.use(attachSessionUser);

app.get("/script.js", (_req, res) => {
  res.sendFile(SCRIPT_PATH);
});

for (const [routePath, fileName] of PUBLIC_PAGES.entries()) {
  app.get(routePath, (req, res) => {
    if (req.user && routePath !== "/") {
      res.redirect(dashboardForRole(req.user.role));
      return;
    }

    res.sendFile(path.join(HTML_DIR, fileName));
  });
}

for (const routePath of STUDENT_PAGES) {
  app.get(routePath, requireStudentPage, (_req, res) => {
    res.sendFile(path.join(HTML_DIR, path.basename(routePath)));
  });
}

for (const routePath of ADMIN_PAGES) {
  app.get(routePath, requireAdminPage, (_req, res) => {
    res.sendFile(path.join(HTML_DIR, path.basename(routePath)));
  });
}

for (const routePath of TEACHER_PAGES) {
  app.get(routePath, requireTeacherPage, (_req, res) => {
    res.sendFile(path.join(HTML_DIR, path.basename(routePath)));
  });
}

for (const routePath of SYSTEM_ADMIN_PAGES) {
  app.get(routePath, requireSystemAdminPage, (_req, res) => {
    res.sendFile(path.join(HTML_DIR, path.basename(routePath)));
  });
}

app.get("/dashboard.html", requireStudentPage, (_req, res) => {
  res.redirect("/student_dashboard.html");
});

app.get("/lesson-selection.html", requireStudentPage, (_req, res) => {
  res.redirect("/subject.html");
});

app.get("/homework-upload.html", requireStudentPage, (_req, res) => {
  res.redirect("/homework_upload.html");
});

app.get("/admin-review.html", requireAdminPage, (_req, res) => {
  res.redirect("/adminrev.html");
});

app.get("/api/public/catalog", async (_req, res, next) => {
  try {
    const subjects = await getPublicSubjectCatalog();
    res.json({
      success: true,
      gradeLevels: AVAILABLE_GRADE_LEVELS,
      subjects
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/session", async (req, res, next) => {
  try {
    if (!req.user) {
      res.json({
        success: true,
        authenticated: false,
        user: null
      });
      return;
    }

    const userRecord = await get(
      `
        SELECT
          id,
          username,
          role,
          display_name AS displayName,
          grade_level AS gradeLevel,
          subjects_json AS subjectsJson,
          points,
          badges_json AS badgesJson
        FROM users
        WHERE id = ?
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      authenticated: true,
      user: userRecord ? toSafeUser(userRecord) : req.user
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/auth/username-availability", async (req, res, next) => {
  try {
    const username = sanitizeUserName(req.query.username);
    const validationMessage = validateUsername(username);

    if (validationMessage) {
      res.json({
        success: true,
        available: false,
        message: validationMessage
      });
      return;
    }

    const existingUser = await get(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );

    res.json({
      success: true,
      available: !existingUser,
      message: existingUser ? "That username is already taken." : "Username is available."
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/register", async (req, res, next) => {
  try {
    const username = sanitizeUserName(req.body.username);
    const password = String(req.body.password || "").trim();
    const displayName = sanitizeDisplayName(req.body.displayName, "");
    const gradeLevel = sanitizeGradeLevel(req.body.gradeLevel);
    const subjectIds = normalizeSubjectSelection(req.body.subjectIds);
    const role = req.body.role === "teacher" ? "teacher" : "student";

    const usernameValidationMessage = validateUsername(username);
    if (usernameValidationMessage) {
      res.status(400).json({
        success: false,
        message: usernameValidationMessage
      });
      return;
    }

    const displayNameValidationMessage = validateDisplayName(displayName);
    if (displayNameValidationMessage) {
      res.status(400).json({
        success: false,
        message: displayNameValidationMessage
      });
      return;
    }

    const gradeLevelValidationMessage = validateGradeLevel(gradeLevel);
    if (gradeLevelValidationMessage) {
      res.status(400).json({
        success: false,
        message: gradeLevelValidationMessage
      });
      return;
    }

    const passwordValidationMessage = validatePasswordForRegistration(
      password,
      username,
      displayName
    );
    if (passwordValidationMessage) {
      res.status(400).json({
        success: false,
        message: passwordValidationMessage
      });
      return;
    }

    const validSubjectIds = await validateSubjectIdsForGrade(subjectIds, gradeLevel);
    if (validSubjectIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "Select at least one subject that matches the chosen grade level."
      });
      return;
    }

    const existingUser = await get(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );

    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "That username is already registered."
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    const result = await run(
      `
        INSERT INTO users (
          username,
          password,
          role,
          display_name,
          created_at,
          grade_level,
          subjects_json,
          points,
          badges_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        username,
        hashedPassword,
        role,
        displayName,
        now,
        gradeLevel,
        JSON.stringify(validSubjectIds),
        0,
        JSON.stringify([])
      ]
    );

    const user = {
      id: result.id,
      username,
      role,
      displayName,
      gradeLevel,
      subjectsJson: JSON.stringify(validSubjectIds),
      points: 0,
      badgesJson: JSON.stringify([])
    };

    setSessionCookie(res, user);
    await recordAudit(user, "register", "user", String(result.id), {
      role,
      gradeLevel,
      subjectIds: validSubjectIds
    });

    if (role === "teacher" && validSubjectIds.length > 0) {
      await run(
        `
          UPDATE subjects
          SET teacher_username = ?
          WHERE id IN (${validSubjectIds.map(() => "?").join(", ")})
        `,
        [username, ...validSubjectIds]
      );
    }

    res.status(201).json({
      success: true,
      user: toSafeUser(user),
      redirectTo: dashboardForRole(role)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const username = sanitizeUserName(req.body.username);
    const password = String(req.body.password || "").trim();
    const loginAttemptKey = getLoginAttemptKey(req, username);
    const throttleState = getLoginThrottleState(loginAttemptKey);

    if (throttleState.locked) {
      res.setHeader("Retry-After", String(throttleState.retryAfterSeconds));
      res.status(429).json({
        success: false,
        message: getLockoutMessage(throttleState.retryAfterSeconds)
      });
      return;
    }

    if (!username || !password) {
      res.status(400).json({
        success: false,
        message: "Username and password are required."
      });
      return;
    }

    const userRecord = await get(
      `
        SELECT
          id,
          username,
          password,
          role,
          display_name AS displayName,
          grade_level AS gradeLevel,
          subjects_json AS subjectsJson,
          points,
          badges_json AS badgesJson
        FROM users
        WHERE username = ?
      `,
      [username]
    );

    if (!userRecord) {
      recordFailedLoginAttempt(loginAttemptKey);
      res.status(401).json({
        success: false,
        message: "Invalid username or password."
      });
      return;
    }

    const isValidPassword = await passwordMatches(password, userRecord.password);
    if (!isValidPassword) {
      const failedAttempt = recordFailedLoginAttempt(loginAttemptKey);
      if (failedAttempt.lockedUntil && failedAttempt.lockedUntil > Date.now()) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((failedAttempt.lockedUntil - Date.now()) / 1000)
        );
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(429).json({
          success: false,
          message: getLockoutMessage(retryAfterSeconds)
        });
        return;
      }

      res.status(401).json({
        success: false,
        message: "Invalid username or password."
      });
      return;
    }

    if (!isHashedPassword(userRecord.password)) {
      await upgradePasswordHash(userRecord.id, password);
    }

    clearLoginAttempts(loginAttemptKey);
    await run(
      `
        UPDATE users
        SET last_login_at = ?
        WHERE id = ?
      `,
      [new Date().toISOString(), userRecord.id]
    );

    const safeUser = toSafeUser(userRecord);
    setSessionCookie(res, safeUser);
    await recordAudit(safeUser, "login", "session", safeUser.username, {
      role: safeUser.role
    });

    res.json({
      success: true,
      user: safeUser,
      redirectTo: dashboardForRole(safeUser.role)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({
    success: true
  });
});

app.get("/api/admin/overview", requireAdminApi, async (_req, res, next) => {
  try {
    const [
      studentCount,
      teacherCount,
      subjectCount,
      quizQuestionCount,
      assignmentStats,
      gradeCount
    ] = await Promise.all([
      get("SELECT COUNT(*) AS total FROM users WHERE role = 'student'"),
      get("SELECT COUNT(*) AS total FROM users WHERE role = 'teacher'"),
      get("SELECT COUNT(*) AS total FROM subjects"),
      get("SELECT COUNT(*) AS total FROM quiz_questions"),
      all(
        `
          SELECT status, COUNT(*) AS total
          FROM assignments
          GROUP BY status
        `
      ),
      get("SELECT COUNT(DISTINCT grade_level) AS total FROM users WHERE role = 'student'")
    ]);

    const assignmentSummary = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0
    };

    for (const row of assignmentStats) {
      const normalizedStatus = String(row.status || "").toLowerCase();
      assignmentSummary.total += row.total;

      if (normalizedStatus === "pending") {
        assignmentSummary.pending = row.total;
      } else if (normalizedStatus === "approved") {
        assignmentSummary.approved = row.total;
      } else if (normalizedStatus === "rejected") {
        assignmentSummary.rejected = row.total;
      }
    }

    res.json({
      success: true,
      stats: {
        students: studentCount?.total || 0,
        teachers: teacherCount?.total || 0,
        subjects: subjectCount?.total || 0,
        quizQuestions: quizQuestionCount?.total || 0,
        gradeLevels: gradeCount?.total || 0,
        assignments: assignmentSummary
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/students", requireAdminApi, async (_req, res, next) => {
  try {
    const rows = await all(
      `
        SELECT
          u.id,
          u.username,
          u.display_name AS displayName,
          u.created_at AS createdAt,
          u.last_login_at AS lastLoginAt,
          COALESCE(lp.lessonsCompleted, 0) AS lessonsCompleted,
          COALESCE(scCount.quizAttempts, 0) AS quizAttempts,
          scLatest.latestScore,
          COALESCE(a.assignmentCount, 0) AS assignmentCount
        FROM users u
        LEFT JOIN (
          SELECT username, COUNT(DISTINCT subject_id) AS lessonsCompleted
          FROM lesson_progress
          GROUP BY username
        ) lp ON lp.username = u.username
        LEFT JOIN (
          SELECT username, COUNT(*) AS quizAttempts
          FROM scores
          GROUP BY username
        ) scCount ON scCount.username = u.username
        LEFT JOIN (
          SELECT s.username, s.score AS latestScore
          FROM scores s
          INNER JOIN (
            SELECT username, MAX(id) AS latestId
            FROM scores
            GROUP BY username
          ) latest ON latest.latestId = s.id
        ) scLatest ON scLatest.username = u.username
        LEFT JOIN (
          SELECT username, COUNT(*) AS assignmentCount
          FROM assignments
          GROUP BY username
        ) a ON a.username = u.username
        WHERE u.role = 'student'
        ORDER BY datetime(u.created_at) DESC, u.username ASC
      `
    );

    res.json({
      success: true,
      students: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        createdAt: row.createdAt,
        lastLoginAt: row.lastLoginAt,
        lessonsCompleted: row.lessonsCompleted,
        quizAttempts: row.quizAttempts,
        latestScore: row.latestScore,
        assignmentCount: row.assignmentCount
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/students", requireAdminApi, async (req, res, next) => {
  try {
    const username = sanitizeUserName(req.body.username);
    const displayName = sanitizeDisplayName(req.body.displayName, "");
    const password = String(req.body.password || "").trim();

    const usernameValidationMessage = validateUsername(username);
    if (usernameValidationMessage) {
      res.status(400).json({
        success: false,
        message: usernameValidationMessage
      });
      return;
    }

    const displayNameValidationMessage = validateDisplayName(displayName);
    if (displayNameValidationMessage) {
      res.status(400).json({
        success: false,
        message: displayNameValidationMessage
      });
      return;
    }

    const passwordValidationMessage = validatePasswordForRegistration(
      password,
      username,
      displayName
    );
    if (passwordValidationMessage) {
      res.status(400).json({
        success: false,
        message: passwordValidationMessage
      });
      return;
    }

    const existingUser = await get(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );
    if (existingUser) {
      res.status(409).json({
        success: false,
        message: "That username is already registered."
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();
    const result = await run(
      `
        INSERT INTO users (username, password, role, display_name, created_at)
        VALUES (?, ?, 'student', ?, ?)
      `,
      [username, hashedPassword, displayName, now]
    );

    res.status(201).json({
      success: true,
      student: {
        id: result.id,
        username,
        displayName,
        createdAt: now
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/subjects", requireAdminApi, async (req, res, next) => {
  try {
    const subjectId = sanitizeSubjectId(req.body.id);
    const name = sanitizeSubjectName(req.body.name);
    const summary = sanitizeSubjectSummary(req.body.summary);
    const gradeLevel = sanitizeGradeLevel(req.body.gradeLevel || "Grade 10");

    const subjectIdValidationMessage = validateSubjectId(subjectId);
    if (subjectIdValidationMessage) {
      res.status(400).json({
        success: false,
        message: subjectIdValidationMessage
      });
      return;
    }

    if (!name) {
      res.status(400).json({
        success: false,
        message: "Subject name is required."
      });
      return;
    }

    if (!summary) {
      res.status(400).json({
        success: false,
        message: "Subject summary is required."
      });
      return;
    }

    const gradeValidationMessage = validateGradeLevel(gradeLevel);
    if (gradeValidationMessage) {
      res.status(400).json({
        success: false,
        message: gradeValidationMessage
      });
      return;
    }

    const existingSubject = await get("SELECT id FROM subjects WHERE id = ?", [subjectId]);
    if (existingSubject) {
      res.status(409).json({
        success: false,
        message: "That subject id already exists."
      });
      return;
    }

    const sortOrderRow = await get("SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextSortOrder FROM subjects");
    const nextSortOrder = sortOrderRow?.nextSortOrder || 1;

    await run(
      `
        INSERT INTO subjects (id, name, summary, sort_order, grade_level, teacher_username)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [subjectId, name, summary, nextSortOrder, gradeLevel, "teacher"]
    );
    await run(
      `
        INSERT INTO lessons (subject_id, title, grade, image_label, body_json)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        subjectId,
        `${name} Basics`,
        gradeLevel,
        `${name} lesson`,
        JSON.stringify(["Add lesson content here."])
      ]
    );
    await run(
      `
        INSERT INTO quiz_questions (
          subject_id,
          prompt,
          options_json,
          answer_index,
          sort_order,
          explanation_text
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        subjectId,
        `Add the first quiz question for ${name}.`,
        JSON.stringify(["Option 1", "Option 2", "Option 3", "Option 4"]),
        0,
        1,
        "Explain why the correct answer works so students get immediate support after the quiz."
      ]
    );

    await recordAudit(req.user, "subject_create", "subject", subjectId, {
      name,
      gradeLevel
    });

    res.status(201).json({
      success: true,
      message: "Subject created successfully."
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/subjects/:id", requireAdminApi, async (req, res, next) => {
  try {
    const subjectId = sanitizeSubjectId(req.params.id);
    const name = sanitizeSubjectName(req.body.name);
    const summary = sanitizeSubjectSummary(req.body.summary);
    const lesson = normalizeLessonPayload(req.body.lesson);
    const quiz = normalizeQuizPayload(req.body.quiz);

    const existingSubject = await get("SELECT id FROM subjects WHERE id = ?", [subjectId]);
    if (!existingSubject) {
      res.status(404).json({
        success: false,
        message: "Subject not found."
      });
      return;
    }

    if (!name || !summary) {
      res.status(400).json({
        success: false,
        message: "Subject name and summary are required."
      });
      return;
    }

    const lessonValidationMessage = validateLessonPayload(lesson);
    if (lessonValidationMessage) {
      res.status(400).json({
        success: false,
        message: lessonValidationMessage
      });
      return;
    }

    const quizValidationMessage = validateQuizPayload(quiz);
    if (quizValidationMessage) {
      res.status(400).json({
        success: false,
        message: quizValidationMessage
      });
      return;
    }

    await saveSubjectContent(subjectId, {
      name,
      summary,
      lesson,
      quiz,
      teacherUsername: req.user.username
    });
    await recordAudit(req.user, "subject_update", "subject", subjectId, {
      quizQuestionCount: quiz.length,
      gradeLevel: lesson.grade
    });

    res.json({
      success: true,
      message: "Subject content saved successfully."
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireAdminApi, async (_req, res, next) => {
  try {
    const users = await getManagedUsers({
      includeRoles: ["student", "teacher", "parent", "admin"]
    });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", requireAdminApi, async (req, res, next) => {
  try {
    const role = normalizeManagedRole(req.body.role, "student");
    if (!SCHOOL_MANAGED_ROLES.has(role)) {
      res.status(400).json({
        success: false,
        message: "School administrators can only create student, teacher, or parent accounts."
      });
      return;
    }

    const user = await createManagedUser({
      actor: req.user,
      username: req.body.username,
      displayName: req.body.displayName,
      password: req.body.password,
      role,
      gradeLevel: req.body.gradeLevel,
      subjectIds: req.body.subjectIds
    });

    res.status(201).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/reports", requireAdminApi, async (_req, res, next) => {
  try {
    const reports = await getAcademicReportSummary();
    res.json({
      success: true,
      reports
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/teacher/overview", requireTeacherApi, async (req, res, next) => {
  try {
    const overview = await getTeacherOverview(req.user);
    res.json({
      success: true,
      ...overview
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/teacher/students", requireTeacherApi, async (req, res, next) => {
  try {
    const students = await getTeacherStudents(req.user);
    res.json({
      success: true,
      students
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/teacher/schedules", requireTeacherApi, async (req, res, next) => {
  try {
    const schedules = await getTeacherSchedules(req.user);
    res.json({
      success: true,
      schedules
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/teacher/schedules", requireTeacherApi, async (req, res, next) => {
  try {
    const subjectId = sanitizeSubjectId(req.body.subjectId);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const gradeLevel = sanitizeGradeLevel(req.body.gradeLevel);
    const dueAt = String(req.body.dueAt || "").trim();

    if (!title) {
      res.status(400).json({
        success: false,
        message: "Quiz title is required."
      });
      return;
    }

    const gradeValidationMessage = validateGradeLevel(gradeLevel);
    if (gradeValidationMessage) {
      res.status(400).json({
        success: false,
        message: gradeValidationMessage
      });
      return;
    }

    const dueDate = new Date(dueAt);
    if (!subjectId || Number.isNaN(dueDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "A valid subject and deadline are required."
      });
      return;
    }

    await ensureTeacherOwnsSubject(req.user, subjectId);

    const result = await run(
      `
        INSERT INTO quiz_schedules (
          subject_id,
          title,
          description,
          grade_level,
          due_at,
          teacher_username,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        subjectId,
        title,
        description,
        gradeLevel,
        dueDate.toISOString(),
        req.user.username,
        new Date().toISOString()
      ]
    );

    await recordAudit(req.user, "quiz_schedule_create", "quiz_schedule", String(result.id), {
      subjectId,
      title,
      gradeLevel,
      dueAt: dueDate.toISOString()
    });

    res.status(201).json({
      success: true,
      scheduleId: result.id
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/teacher/notes", requireTeacherApi, async (req, res, next) => {
  try {
    const username = sanitizeUserName(req.body.username);
    const subjectId = sanitizeSubjectId(req.body.subjectId);
    const note = String(req.body.note || "").trim();

    if (!username || !subjectId || !note) {
      res.status(400).json({
        success: false,
        message: "Student, subject, and note are required."
      });
      return;
    }

    await ensureTeacherOwnsSubject(req.user, subjectId);

    const student = await get(
      `
        SELECT username
        FROM users
        WHERE username = ? AND role = 'student'
      `,
      [username]
    );
    if (!student) {
      res.status(404).json({
        success: false,
        message: "Student not found."
      });
      return;
    }

    const result = await run(
      `
        INSERT INTO teacher_notes (username, subject_id, note, teacher_username, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [username, subjectId, note, req.user.username, new Date().toISOString()]
    );

    await recordAudit(req.user, "teacher_note_create", "teacher_note", String(result.id), {
      username,
      subjectId
    });

    res.status(201).json({
      success: true
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/teacher/subjects/:id", requireTeacherApi, async (req, res, next) => {
  try {
    const subjectId = sanitizeSubjectId(req.params.id);
    const name = sanitizeSubjectName(req.body.name);
    const summary = sanitizeSubjectSummary(req.body.summary);
    const lesson = normalizeLessonPayload(req.body.lesson);
    const quiz = normalizeQuizPayload(req.body.quiz);

    await ensureTeacherOwnsSubject(req.user, subjectId);

    if (!name || !summary) {
      res.status(400).json({
        success: false,
        message: "Subject name and summary are required."
      });
      return;
    }

    const lessonValidationMessage = validateLessonPayload(lesson);
    if (lessonValidationMessage) {
      res.status(400).json({
        success: false,
        message: lessonValidationMessage
      });
      return;
    }

    const quizValidationMessage = validateQuizPayload(quiz);
    if (quizValidationMessage) {
      res.status(400).json({
        success: false,
        message: quizValidationMessage
      });
      return;
    }

    await saveSubjectContent(subjectId, {
      name,
      summary,
      lesson,
      quiz,
      teacherUsername: req.user.username
    });
    await recordAudit(req.user, "teacher_subject_update", "subject", subjectId, {
      quizQuestionCount: quiz.length,
      gradeLevel: lesson.grade
    });

    res.json({
      success: true,
      message: "Subject content updated."
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ai/quiz", requireAdminApi, async (req, res, next) => {
  try {
    const subjectId = sanitizeSubjectId(req.body.subjectId);
    const subject = await getSubjectById(subjectId, req.user);
    if (!subject) {
      res.status(400).json({ success: false, message: "Select a valid subject first." });
      return;
    }

    const quiz = await generateQuizDraft(subject, req.body);
    res.json({ success: true, quiz });
  } catch (error) {
    next(error);
  }
});

app.post("/api/teacher/ai/quiz", requireTeacherApi, async (req, res, next) => {
  try {
    const subjectId = sanitizeSubjectId(req.body.subjectId);
    await ensureTeacherOwnsSubject(req.user, subjectId);
    const subject = await getSubjectById(subjectId, req.user);
    if (!subject) {
      res.status(400).json({ success: false, message: "Select a valid assigned subject first." });
      return;
    }

    const quiz = await generateQuizDraft(subject, req.body);
    res.json({ success: true, quiz });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ai/analytics", requireAdminApi, async (_req, res, next) => {
  try {
    const reports = await getAdminReports();
    const insight = await generateAnalyticsInsight({
      audience: "school administrator",
      reports
    });
    res.json({ success: true, insight });
  } catch (error) {
    next(error);
  }
});

app.get("/api/teacher/ai/analytics", requireTeacherApi, async (req, res, next) => {
  try {
    const overview = await getTeacherOverview(req.user);
    const insight = await generateAnalyticsInsight({
      audience: "teacher",
      stats: overview.stats,
      students: overview.students,
      subjects: overview.subjects
    });
    res.json({ success: true, insight });
  } catch (error) {
    next(error);
  }
});

app.get("/api/progress/ai", requireStudentApi, async (req, res, next) => {
  try {
    const profile = await loadUserProfileByUsername(req.user.username);
    const progress = await getProgressForUser(profile || req.user);
    const insight = await generateAnalyticsInsight({
      audience: "student",
      progress
    });
    res.json({ success: true, insight });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/overview", requireSystemAdminApi, async (_req, res, next) => {
  try {
    const overview = await getSystemOverview();
    res.json({
      success: true,
      ...overview
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/users", requireSystemAdminApi, async (_req, res, next) => {
  try {
    const users = await getManagedUsers({
      includeRoles: ["student", "teacher", "parent", "admin", "system_admin"]
    });

    res.json({
      success: true,
      users
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/system/users/:id", requireSystemAdminApi, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const role = normalizeManagedRole(req.body.role, "student");
    const gradeLevel = sanitizeGradeLevel(req.body.gradeLevel);
    const subjectIds = normalizeSubjectSelection(req.body.subjectIds);

    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(400).json({
        success: false,
        message: "A valid user id is required."
      });
      return;
    }

    const gradeLevelValidationMessage =
      role === "student" || role === "teacher" || role === "parent"
        ? validateGradeLevel(gradeLevel)
        : null;
    if (gradeLevelValidationMessage) {
      res.status(400).json({
        success: false,
        message: gradeLevelValidationMessage
      });
      return;
    }

    const validSubjectIds = await validateSubjectIdsForGrade(
      subjectIds,
      role === "student" || role === "teacher" || role === "parent" ? gradeLevel : ""
    );
    const user = await get("SELECT username, role FROM users WHERE id = ?", [userId]);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found."
      });
      return;
    }

    await run(
      `
        UPDATE users
        SET role = ?,
            grade_level = ?,
            subjects_json = ?
        WHERE id = ?
      `,
      [role, gradeLevel || "Grade 10", JSON.stringify(validSubjectIds), userId]
    );

    if (role === "teacher" && validSubjectIds.length > 0) {
      await run(
        `
          UPDATE subjects
          SET teacher_username = ?
          WHERE id IN (${validSubjectIds.map(() => "?").join(", ")})
        `,
        [user.username, ...validSubjectIds]
      );
    }

    await recordAudit(req.user, "rbac_update", "user", String(userId), {
      username: user.username,
      previousRole: user.role,
      nextRole: role,
      gradeLevel,
      subjectIds: validSubjectIds
    });

    res.json({
      success: true
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/audit", requireSystemAdminApi, async (_req, res, next) => {
  try {
    const logs = await getAuditLogs();
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/system/permissions", requireSystemAdminApi, (_req, res) => {
  res.json({
    success: true,
    permissions: ROLE_PERMISSIONS
  });
});

app.get("/api/system/backups", requireSystemAdminApi, (_req, res, next) => {
  try {
    res.json({
      success: true,
      backups: listBackups()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/system/backups", requireSystemAdminApi, async (req, res, next) => {
  try {
    const backup = await createDatabaseBackup();
    await recordAudit(req.user, "backup_create", "backup", backup.fileName, backup);
    res.status(201).json({
      success: true,
      backup
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/content", requireAuthApi, async (req, res, next) => {
  try {
    const activeUser =
      req.user.role === "student" ? await loadUserProfileByUsername(req.user.username) : req.user;
    const subjects = await getAllContent(activeUser || req.user);
    res.json({
      success: true,
      subjects
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/progress", requireStudentApi, async (req, res, next) => {
  try {
    const progress = await getProgressForUser(req.user);
    res.json({
      success: true,
      ...progress
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/lessons/complete", requireStudentApi, async (req, res, next) => {
  try {
    const subjectId = String(req.body.subjectId || "").trim();
    const activeUser = await loadUserProfileByUsername(req.user.username);
    const subject = await getSubjectById(subjectId, activeUser || req.user);

    if (!subject) {
      res.status(400).json({
        success: false,
        message: "A valid subject is required."
      });
      return;
    }

    const existing = await get(
      `
        SELECT id
        FROM lesson_progress
        WHERE username = ? AND subject_id = ?
      `,
      [req.user.username, subjectId]
    );

    if (!existing) {
      await run(
        `
          INSERT INTO lesson_progress (username, subject_id, completed_at)
          VALUES (?, ?, ?)
        `,
        [req.user.username, subjectId, new Date().toISOString()]
      );
    }

    const rewards = await refreshStudentGamification(req.user.username);
    await recordAudit(req.user, "lesson_complete", "subject", subjectId, {
      subjectName: subject.name,
      points: rewards.points
    });

    res.json({
      success: true,
      rewards
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/scores", requireStudentApi, async (req, res, next) => {
  try {
    const subjectId = String(req.body.subjectId || "").trim();
    const submittedAnswers = Array.isArray(req.body.answers) ? req.body.answers : null;
    const activeUser = await loadUserProfileByUsername(req.user.username);
    const subject = await getSubjectById(subjectId, activeUser || req.user);
    const totalQuestions = subject?.quiz.length || Number(req.body.totalQuestions);

    if (
      !subject ||
      !Number.isFinite(totalQuestions) ||
      totalQuestions <= 0
    ) {
      res.status(400).json({
        success: false,
        message: "A valid quiz submission is required."
      });
      return;
    }

    const submittedValues =
      submittedAnswers && submittedAnswers.length === subject.quiz.length
        ? submittedAnswers
        : subject.quiz.map((_question, index) => req.body?.answers?.[index]);

    if (
      !Array.isArray(submittedValues) ||
      submittedValues.length !== subject.quiz.length ||
      submittedValues.some((answer) => answer === undefined || answer === null || String(answer).trim() === "")
    ) {
      res.status(400).json({
        success: false,
        message: "Submit one answer for each quiz question."
      });
      return;
    }

    const feedback = subject.quiz.map((question, index) => {
      const type = normalizeQuestionType(question.type);
      const submittedValue = submittedValues[index];
      const selectedIndex = Number(submittedValue);
      const selectedText = String(submittedValue || "").trim();
      const correctOption =
        type === "short_answer"
          ? question.answerText
          : question.options[question.answerIndex] || "";
      const isCorrect =
        type === "short_answer"
          ? normalizeAnswerText(selectedText) === normalizeAnswerText(question.answerText)
          : Number.isInteger(selectedIndex) && selectedIndex === question.answerIndex;

      return {
        type,
        prompt: question.prompt,
        selectedIndex: Number.isInteger(selectedIndex) ? selectedIndex : null,
        selectedOption: type === "short_answer" ? selectedText : question.options[selectedIndex] || "",
        correctIndex: question.answerIndex,
        correctOption,
        explanation:
          question.explanation ||
          `The correct answer is ${correctOption}. Review the lesson example before your next attempt.`,
        isCorrect
      };
    });

    const correctAnswers = feedback.reduce(
      (total, result) => total + (result.isCorrect ? 1 : 0),
      0
    );
    const percentage = Math.round((correctAnswers / totalQuestions) * 100);

    await run(
      `
        INSERT INTO scores (username, score, subject_id, total_questions, submitted_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        req.user.username,
        percentage,
        subjectId,
        totalQuestions,
        new Date().toISOString()
      ]
    );

    const existingLesson = await get(
      `
        SELECT id
        FROM lesson_progress
        WHERE username = ? AND subject_id = ?
      `,
      [req.user.username, subjectId]
    );

    if (!existingLesson) {
      await run(
        `
          INSERT INTO lesson_progress (username, subject_id, completed_at)
          VALUES (?, ?, ?)
        `,
        [req.user.username, subjectId, new Date().toISOString()]
      );
    }

    const rewards = await refreshStudentGamification(req.user.username);
    await recordAudit(req.user, "quiz_attempt", "subject", subjectId, {
      score: percentage,
      correctAnswers,
      totalQuestions
    });

    res.json({
      success: true,
      score: percentage,
      correctAnswers,
      totalQuestions,
      feedback,
      rewards
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/assignments", requireStudentApi, async (req, res, next) => {
  try {
    const subjectId = String(req.body.subjectId || "").trim();
    const title = String(req.body.title || "").trim();
    const originalFileName = sanitizeFileName(req.body.fileName || "");
    const fileData = String(req.body.fileData || "").trim();
    const providedMimeType = String(req.body.mimeType || "").trim();
    const activeUser = await loadUserProfileByUsername(req.user.username);
    const subject = await getSubjectById(subjectId, activeUser || req.user);

    if (!subject || !title || !originalFileName || !fileData) {
      res.status(400).json({
        success: false,
        message: "All homework fields are required."
      });
      return;
    }

    const storedFile = persistUpload(originalFileName, fileData, providedMimeType);

    await run(
      `
        INSERT INTO assignments (
          username,
          subject_id,
          title,
          file_name,
          file_data,
          file_path,
          stored_name,
          mime_type,
          file_size,
          status,
          submitted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)
      `,
      [
        req.user.username,
        subjectId,
        title,
        originalFileName,
        null,
        storedFile.relativePath,
        storedFile.storedName,
        storedFile.mimeType,
        storedFile.fileSize,
        new Date().toISOString()
      ]
    );

    await recordAudit(req.user, "assignment_upload", "assignment", originalFileName, {
      subjectId,
      title
    });

    res.status(201).json({
      success: true,
      message: "Homework submitted successfully."
    });
  } catch (error) {
    if (error.message === "INVALID_DATA_URL" || error.message === "UPLOAD_TOO_LARGE") {
      res.status(400).json({
        success: false,
        message:
          error.message === "UPLOAD_TOO_LARGE"
            ? "The file must be smaller than 5 MB."
            : "The selected file could not be processed."
      });
      return;
    }

    next(error);
  }
});

app.get("/api/assignments", requireAuthApi, async (req, res, next) => {
  try {
    const requestedStatus = String(req.query.status || "").trim();
    const where = [];
    const params = [];

    if (req.user.role !== "admin") {
      where.push("a.username = ?");
      params.push(req.user.username);
    }

    if (requestedStatus) {
      where.push("LOWER(a.status) = LOWER(?)");
      params.push(requestedStatus);
    }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await all(
      `
        SELECT
          a.id,
          a.username,
          u.display_name AS displayName,
          a.subject_id AS subjectId,
          s.name AS subjectName,
          a.title,
          a.file_name AS fileName,
          a.file_path AS filePath,
          a.mime_type AS mimeType,
          a.file_size AS fileSize,
          a.status,
          a.score,
          a.feedback,
          a.reviewed_by AS reviewedBy,
          a.submitted_at AS submittedAt,
          a.reviewed_at AS reviewedAt
        FROM assignments a
        LEFT JOIN users u ON u.username = a.username
        LEFT JOIN subjects s ON s.id = a.subject_id
        ${whereClause}
        ORDER BY datetime(a.submitted_at) DESC, a.id DESC
      `,
      params
    );

    res.json({
      success: true,
      assignments: rows.map((row) => toAssignmentResponse(row))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/assignments/:id/file", requireAuthApi, async (req, res, next) => {
  try {
    const assignmentId = Number(req.params.id);
    const assignment = await get(
      `
        SELECT
          id,
          username,
          file_name AS fileName,
          file_data AS fileData,
          file_path AS filePath,
          mime_type AS mimeType
        FROM assignments
        WHERE id = ?
      `,
      [assignmentId]
    );

    if (!assignment) {
      res.status(404).json({
        success: false,
        message: "Assignment not found."
      });
      return;
    }

    if (req.user.role !== "admin" && req.user.username !== assignment.username) {
      res.status(403).json({
        success: false,
        message: "You do not have access to that file."
      });
      return;
    }

    if (assignment.filePath) {
      const absolutePath = path.join(DATA_DIR, assignment.filePath);
      if (fs.existsSync(absolutePath)) {
        res.download(absolutePath, assignment.fileName);
        return;
      }
    }

    if (assignment.fileData) {
      const legacyFile = parseDataUrl(assignment.fileData, assignment.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${assignment.fileName.replaceAll('"', "")}"`
      );
      res.type(legacyFile.mimeType);
      res.send(legacyFile.buffer);
      return;
    }

    res.status(404).json({
      success: false,
      message: "The uploaded file could not be found."
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/assignments/:id/review", requireAdminApi, async (req, res, next) => {
  try {
    const assignmentId = Number(req.params.id);
    const status = req.body.status === "Approved" ? "Approved" : "Rejected";
    const score =
      req.body.score === "" || req.body.score === null || req.body.score === undefined
        ? null
        : Number(req.body.score);
    const feedback = String(req.body.feedback || "").trim();

    if (!Number.isInteger(assignmentId)) {
      res.status(400).json({
        success: false,
        message: "Invalid assignment id."
      });
      return;
    }

    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      res.status(400).json({
        success: false,
        message: "Score must be between 0 and 100."
      });
      return;
    }

    const assignment = await get("SELECT id FROM assignments WHERE id = ?", [assignmentId]);
    if (!assignment) {
      res.status(404).json({
        success: false,
        message: "Assignment not found."
      });
      return;
    }

    await run(
      `
        UPDATE assignments
        SET status = ?, score = ?, feedback = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ?
      `,
      [
        status,
        score,
        feedback,
        req.user.username,
        new Date().toISOString(),
        assignmentId
      ]
    );

    await recordAudit(req.user, "assignment_review", "assignment", String(assignmentId), {
      status,
      score
    });

    res.json({
      success: true
    });
  } catch (error) {
    next(error);
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500
        ? "Unexpected server error."
        : err.publicMessage || err.message || "Request failed."
  });
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }

      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const hasColumn = columns.some((column) => column.name === columnName);

  if (!hasColumn) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureDirectory(directoryPath) {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
}

async function initializeDatabase() {
  ensureDirectory(DATA_DIR);
  ensureDirectory(UPLOAD_DIR);
  ensureDirectory(BACKUP_DIR);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT
    )
  `);

  await ensureColumn("users", "role", "TEXT DEFAULT 'student'");
  await ensureColumn("users", "display_name", "TEXT");
  await ensureColumn("users", "created_at", "TEXT");
  await ensureColumn("users", "last_login_at", "TEXT");
  await ensureColumn("users", "grade_level", "TEXT DEFAULT 'Grade 10'");
  await ensureColumn("users", "subjects_json", "TEXT DEFAULT '[]'");
  await ensureColumn("users", "points", "INTEGER DEFAULT 0");
  await ensureColumn("users", "badges_json", "TEXT DEFAULT '[]'");

  await run(`
    UPDATE users
    SET role = COALESCE(NULLIF(role, ''), 'student')
  `);

  await run(`
    UPDATE users
    SET display_name = COALESCE(NULLIF(display_name, ''), username)
  `);

  await run(`
    UPDATE users
    SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP)
  `);

  await run(`
    UPDATE users
    SET grade_level = COALESCE(NULLIF(grade_level, ''), 'Grade 10')
  `);

  await run(`
    UPDATE users
    SET subjects_json = COALESCE(NULLIF(subjects_json, ''), '[]')
  `);

  await run(`
    UPDATE users
    SET points = COALESCE(points, 0)
  `);

  await run(`
    UPDATE users
    SET badges_json = COALESCE(NULLIF(badges_json, ''), '[]')
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      summary TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await ensureColumn("subjects", "grade_level", "TEXT DEFAULT 'General'");
  await ensureColumn("subjects", "teacher_username", "TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      grade TEXT NOT NULL,
      image_label TEXT NOT NULL,
      body_json TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      answer_index INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await ensureColumn("quiz_questions", "explanation_text", "TEXT DEFAULT ''");
  await ensureColumn("quiz_questions", "question_type", "TEXT DEFAULT 'multiple_choice'");
  await ensureColumn("quiz_questions", "answer_text", "TEXT DEFAULT ''");

  await run(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      score INTEGER
    )
  `);

  await ensureColumn("scores", "subject_id", "TEXT");
  await ensureColumn("scores", "total_questions", "INTEGER DEFAULT 0");
  await ensureColumn("scores", "submitted_at", "TEXT");

  await run(`
    UPDATE scores
    SET subject_id = COALESCE(NULLIF(subject_id, ''), 'mathematics')
  `);

  await run(`
    UPDATE scores
    SET total_questions = COALESCE(total_questions, 0)
  `);

  await run(`
    UPDATE scores
    SET submitted_at = COALESCE(submitted_at, CURRENT_TIMESTAMP)
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS lesson_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      completed_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_data TEXT,
      mime_type TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      score INTEGER,
      feedback TEXT,
      reviewed_by TEXT,
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT
    )
  `);

  await ensureColumn("assignments", "file_path", "TEXT");
  await ensureColumn("assignments", "stored_name", "TEXT");
  await ensureColumn("assignments", "file_size", "INTEGER DEFAULT 0");

  await run(`
    CREATE TABLE IF NOT EXISTS quiz_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      grade_level TEXT NOT NULL,
      due_at TEXT NOT NULL,
      teacher_username TEXT NOT NULL,
      created_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS teacher_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      note TEXT NOT NULL,
      teacher_username TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_username TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await seedContent();
  await syncSubjectMetadata();
  await syncQuestionExplanations();
  await seedRoleAccounts();
}

async function seedContent() {
  const subjectCount = await get("SELECT COUNT(*) AS total FROM subjects");
  if ((subjectCount?.total || 0) > 0) {
    return;
  }

  for (const subject of SEEDED_CONTENT) {
    await run(
      `
        INSERT INTO subjects (id, name, summary, sort_order, grade_level, teacher_username)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        subject.id,
        subject.name,
        subject.summary,
        subject.sortOrder,
        subject.lesson.grade || "Grade 10",
        "teacher"
      ]
    );

    await run(
      `
        INSERT INTO lessons (subject_id, title, grade, image_label, body_json)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        subject.id,
        subject.lesson.title,
        subject.lesson.grade,
        subject.lesson.imageLabel,
        JSON.stringify(subject.lesson.paragraphs)
      ]
    );

    for (const [questionIndex, question] of subject.quiz.entries()) {
      await run(
        `
        INSERT INTO quiz_questions (subject_id, prompt, options_json, answer_index, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `,
        [
          subject.id,
          question.prompt,
          JSON.stringify(question.options),
          question.answerIndex,
          questionIndex + 1
        ]
      );
    }
  }
}

async function syncSubjectMetadata() {
  await run(`
    UPDATE subjects
    SET grade_level = COALESCE(NULLIF(grade_level, ''), 'Grade 10')
  `);

  await run(`
    UPDATE subjects
    SET teacher_username = COALESCE(NULLIF(teacher_username, ''), 'teacher')
  `);

  await run(`
    UPDATE subjects
    SET grade_level = COALESCE(
      NULLIF(grade_level, ''),
      (
        SELECT NULLIF(lessons.grade, '')
        FROM lessons
        WHERE lessons.subject_id = subjects.id
        ORDER BY lessons.id ASC
        LIMIT 1
      ),
      'Grade 10'
    )
  `);
}

async function syncQuestionExplanations() {
  await run(`
    UPDATE quiz_questions
    SET explanation_text = CASE
      WHEN explanation_text IS NULL OR explanation_text = ''
        THEN 'Review the lesson examples and compare the correct option before the next attempt.'
      ELSE explanation_text
    END
  `);
}

async function seedRoleAccounts() {
  await ensureSeedUser({
    username: "admin",
    password: "admin123",
    role: "admin",
    displayName: "School Administrator",
    gradeLevel: "Grade 10",
    subjectIds: []
  });

  await ensureSeedUser({
    username: "teacher",
    password: "teacher123",
    role: "teacher",
    displayName: "Teacher Demo",
    gradeLevel: "Grade 10",
    subjectIds: ["mathematics", "science"]
  });

  await ensureSeedUser({
    username: "sysadmin",
    password: "sysadmin123",
    role: "system_admin",
    displayName: "System Administrator",
    gradeLevel: "Grade 10",
    subjectIds: []
  });
}

async function ensureSeedUser({ username, password, role, displayName, gradeLevel, subjectIds }) {
  const existingUser = await get(
    `
      SELECT id, password
      FROM users
      WHERE username = ? AND role = ?
    `,
    [username, role]
  );

  const hashedPassword = await bcrypt.hash(password, 10);
  const now = new Date().toISOString();

  if (!existingUser) {
    await run(
      `
        INSERT INTO users (
          username,
          password,
          role,
          display_name,
          created_at,
          grade_level,
          subjects_json,
          points,
          badges_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        username,
        hashedPassword,
        role,
        displayName,
        now,
        gradeLevel,
        JSON.stringify(subjectIds),
        0,
        JSON.stringify([])
      ]
    );
    return;
  }

  if (!isHashedPassword(existingUser.password)) {
    await run(
      `
        UPDATE users
        SET password = ?
        WHERE id = ?
      `,
      [hashedPassword, existingUser.id]
    );
  }

  await run(
    `
      UPDATE users
      SET display_name = ?,
          grade_level = ?,
          subjects_json = COALESCE(NULLIF(subjects_json, ''), ?),
          badges_json = COALESCE(NULLIF(badges_json, ''), '[]'),
          points = COALESCE(points, 0)
      WHERE id = ?
    `,
    [displayName, gradeLevel, JSON.stringify(subjectIds), existingUser.id]
  );
}

function sanitizeUserName(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeDisplayName(value, fallback) {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  return name || fallback;
}

function sanitizeGradeLevel(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function sanitizeFileName(value) {
  const safeName = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ");

  return safeName || "upload.bin";
}

function validateUsername(username) {
  if (!username) {
    return "Username is required.";
  }

  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters long.`;
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    return "Username can only use lowercase letters, numbers, dots, underscores, and hyphens.";
  }

  if (!/^[a-z0-9]/.test(username) || !/[a-z0-9]$/.test(username)) {
    return "Username must start and end with a letter or number.";
  }

  if (/[._-]{2,}/.test(username)) {
    return "Username cannot contain repeated separators.";
  }

  return null;
}

function validateDisplayName(displayName) {
  if (!displayName) {
    return "Display name is required.";
  }

  if (
    displayName.length < DISPLAY_NAME_MIN_LENGTH ||
    displayName.length > DISPLAY_NAME_MAX_LENGTH
  ) {
    return `Display name must be ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} characters long.`;
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9 .'-]*$/.test(displayName)) {
    return "Display name contains unsupported characters.";
  }

  return null;
}

function validatePasswordForRegistration(password, username, displayName) {
  if (!password) {
    return "Password is required.";
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }

  if (!/[a-z]/.test(password)) {
    return "Password must include a lowercase letter.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must include an uppercase letter.";
  }

  if (!/[0-9]/.test(password)) {
    return "Password must include a number.";
  }

  const loweredPassword = password.toLowerCase();
  if (username && loweredPassword.includes(username)) {
    return "Password cannot contain your username.";
  }

  const compactDisplayName = String(displayName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (compactDisplayName && compactDisplayName.length >= 4 && loweredPassword.includes(compactDisplayName)) {
    return "Password is too close to your display name.";
  }

  return null;
}

function sanitizeSubjectId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function sanitizeSubjectName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function sanitizeSubjectSummary(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLoginRole(value) {
  const role = String(value || "student").trim();
  return LOGIN_ROLE_VALUES.has(role) ? role : "student";
}

function normalizeManagedRole(value, fallback = "student") {
  const role = String(value || fallback).trim();
  return MANAGED_ROLE_VALUES.has(role) ? role : fallback;
}

function normalizeSubjectSelection(value) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return [...new Set(rawValues.map((entry) => sanitizeSubjectId(entry)).filter(Boolean))];
}

function validateSubjectId(subjectId) {
  if (!subjectId) {
    return "Subject id is required.";
  }

  if (subjectId.length < SUBJECT_ID_MIN_LENGTH || subjectId.length > SUBJECT_ID_MAX_LENGTH) {
    return `Subject id must be ${SUBJECT_ID_MIN_LENGTH}-${SUBJECT_ID_MAX_LENGTH} characters long.`;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subjectId)) {
    return "Subject id can only use lowercase letters, numbers, and single hyphens.";
  }

  return null;
}

function validateGradeLevel(gradeLevel) {
  if (!gradeLevel) {
    return "Grade level is required.";
  }

  if (gradeLevel.length < 3 || gradeLevel.length > 30) {
    return "Grade level must be 3-30 characters long.";
  }

  return null;
}

async function validateSubjectIds(subjectIds) {
  if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
    return [];
  }

  const validSubjects = await all(`
    SELECT id
    FROM subjects
  `);
  const validIds = new Set(validSubjects.map((subject) => subject.id));
  return subjectIds.filter((subjectId) => validIds.has(subjectId));
}

function matchesGradeLevel(subjectGradeLevel, activeGradeLevel) {
  if (!activeGradeLevel) {
    return true;
  }

  const normalizedSubjectGrade = String(subjectGradeLevel || "").trim();
  return (
    !normalizedSubjectGrade ||
    normalizedSubjectGrade === "General" ||
    normalizedSubjectGrade === activeGradeLevel
  );
}

async function validateSubjectIdsForGrade(subjectIds, gradeLevel) {
  const validSubjectIds = await validateSubjectIds(subjectIds);
  if (validSubjectIds.length === 0) {
    return [];
  }

  const subjectRows = await all(
    `
      SELECT
        id,
        COALESCE(NULLIF(grade_level, ''), 'Grade 10') AS gradeLevel
      FROM subjects
      WHERE id IN (${validSubjectIds.map(() => "?").join(", ")})
    `,
    validSubjectIds
  );
  const gradeMap = new Map(subjectRows.map((subject) => [subject.id, subject.gradeLevel]));

  return validSubjectIds.filter((subjectId) => matchesGradeLevel(gradeMap.get(subjectId), gradeLevel));
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function formatRoleLabel(role) {
  if (role === "system_admin") {
    return "System Administrator";
  }

  if (role === "admin") {
    return "School Administrator";
  }

  if (role === "teacher") {
    return "Teacher";
  }

  if (role === "parent") {
    return "Parent";
  }

  return "Student";
}

function normalizeLessonPayload(rawLesson) {
  const lesson = rawLesson && typeof rawLesson === "object" ? rawLesson : {};
  const paragraphs = Array.isArray(lesson.paragraphs)
    ? lesson.paragraphs
        .map((paragraph) => String(paragraph || "").trim())
        .filter(Boolean)
    : [];

  return {
    title: String(lesson.title || "").trim(),
    grade: String(lesson.grade || "").trim(),
    imageLabel: String(lesson.imageLabel || "").trim(),
    paragraphs
  };
}

function validateLessonPayload(lesson) {
  if (!lesson.title) {
    return "Lesson title is required.";
  }

  if (!lesson.grade) {
    return "Lesson grade label is required.";
  }

  if (!lesson.imageLabel) {
    return "Lesson image label is required.";
  }

  if (!Array.isArray(lesson.paragraphs) || lesson.paragraphs.length === 0) {
    return "Lesson content must include at least one paragraph.";
  }

  return null;
}

function normalizeQuizPayload(rawQuiz) {
  if (!Array.isArray(rawQuiz)) {
    return [];
  }

  return rawQuiz.map((rawQuestion) => {
    const question = rawQuestion && typeof rawQuestion === "object" ? rawQuestion : {};
    const type = normalizeQuestionType(question.type || question.questionType);
    const options = Array.isArray(question.options)
      ? question.options.map((option) => String(option || "").trim()).filter(Boolean)
      : [];
    const normalizedOptions =
      type === "true_false"
        ? ["True", "False"]
        : type === "short_answer"
          ? []
          : options;
    const answerText =
      type === "short_answer"
        ? String(question.answerText || question.correctAnswer || "").trim()
        : "";

    return {
      type,
      prompt: String(question.prompt || "").trim(),
      options: normalizedOptions,
      answerIndex: type === "short_answer" ? 0 : Number(question.answerIndex),
      answerText,
      explanation: String(question.explanation || "").trim()
    };
  });
}

function validateQuizPayload(quiz) {
  if (!Array.isArray(quiz) || quiz.length === 0) {
    return "Quiz content must include at least one question.";
  }

  for (const [questionIndex, question] of quiz.entries()) {
    if (!question.prompt) {
      return `Question ${questionIndex + 1} needs a prompt.`;
    }

    if (question.type !== "short_answer" && question.options.length < 2) {
      return `Question ${questionIndex + 1} needs at least two options.`;
    }

    if (question.type === "short_answer" && !question.answerText) {
      return `Question ${questionIndex + 1} needs an accepted answer.`;
    }

    if (
      question.type !== "short_answer" &&
      (
        !Number.isInteger(question.answerIndex) ||
        question.answerIndex < 0 ||
        question.answerIndex >= question.options.length
      )
    ) {
      return `Question ${questionIndex + 1} must have a valid correct answer.`;
    }

    if (!question.explanation) {
      return `Question ${questionIndex + 1} needs an explanation for student feedback.`;
    }
  }

  return null;
}

function normalizeQuestionType(value) {
  const type = String(value || "multiple_choice").trim();
  return QUESTION_TYPES.has(type) ? type : "multiple_choice";
}

function normalizeAnswerText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function pruneLoginAttempts(now = Date.now()) {
  for (const [key, record] of loginAttemptTracker.entries()) {
    const isLocked = record.lockedUntil && record.lockedUntil > now;
    const isExpired = now - record.lastAttemptAt > LOGIN_ATTEMPT_WINDOW_MS;

    if (!isLocked && isExpired) {
      loginAttemptTracker.delete(key);
    }
  }
}

function getLoginAttemptKey(req, username) {
  return `${normalizeClientIp(req)}|${username || "anonymous"}`;
}

function getLoginThrottleState(key, now = Date.now()) {
  pruneLoginAttempts(now);

  const record = loginAttemptTracker.get(key);
  if (!record) {
    return {
      locked: false,
      retryAfterSeconds: 0
    };
  }

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((record.lockedUntil - now) / 1000))
    };
  }

  if (now - record.firstAttemptAt > LOGIN_ATTEMPT_WINDOW_MS) {
    loginAttemptTracker.delete(key);
  }

  return {
    locked: false,
    retryAfterSeconds: 0
  };
}

function recordFailedLoginAttempt(key, now = Date.now()) {
  const existingRecord = loginAttemptTracker.get(key);
  const isFreshWindow =
    existingRecord && now - existingRecord.firstAttemptAt <= LOGIN_ATTEMPT_WINDOW_MS;

  const record = isFreshWindow
    ? { ...existingRecord }
    : {
        count: 0,
        firstAttemptAt: now,
        lastAttemptAt: now,
        lockedUntil: 0
      };

  record.count += 1;
  record.lastAttemptAt = now;

  if (record.count >= LOGIN_ATTEMPT_LIMIT) {
    record.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }

  loginAttemptTracker.set(key, record);
  return record;
}

function clearLoginAttempts(key) {
  loginAttemptTracker.delete(key);
}

function getLockoutMessage(retryAfterSeconds) {
  const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
  return `Too many login attempts. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`;
}

function isHashedPassword(password) {
  return typeof password === "string" && password.startsWith("$2");
}

async function passwordMatches(password, storedPassword) {
  if (!storedPassword) {
    return false;
  }

  if (isHashedPassword(storedPassword)) {
    return bcrypt.compare(password, storedPassword);
  }

  return storedPassword === password;
}

async function upgradePasswordHash(userId, password) {
  const hashedPassword = await bcrypt.hash(password, 10);
  await run(
    `
      UPDATE users
      SET password = ?
      WHERE id = ?
    `,
    [hashedPassword, userId]
  );
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, chunk) => {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex === -1) {
      return cookies;
    }

    const key = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function setSessionCookie(res, user) {
  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      gradeLevel: user.gradeLevel,
      subjectIds: Array.isArray(user.subjectIds)
        ? user.subjectIds
        : parseJsonArray(user.subjectsJson)
    },
    AUTH_SECRET,
    {
      expiresIn: SESSION_MAX_AGE_SECONDS
    }
  );

  const cookieParts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (USE_SECURE_COOKIES) {
    cookieParts.push("Secure");
  }

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function clearSessionCookie(res) {
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (USE_SECURE_COOKIES) {
    cookieParts.push("Secure");
  }

  res.setHeader("Set-Cookie", cookieParts.join("; "));
}

function attachSessionUser(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[AUTH_COOKIE_NAME];

  if (!token) {
    req.user = null;
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, AUTH_SECRET);
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      displayName: payload.displayName,
      gradeLevel: payload.gradeLevel,
      subjectIds: Array.isArray(payload.subjectIds) ? payload.subjectIds : []
    };
  } catch (_error) {
    req.user = null;
  }

  next();
}

function dashboardForRole(role) {
  if (role === "teacher") {
    return "/teacherdash.html";
  }

  if (role === "admin") {
    return "/admindash.html";
  }

  if (role === "system_admin") {
    return "/sysadmindash.html";
  }

  return "/student_dashboard.html";
}

function requireAuthPage(req, res, next) {
  if (!req.user) {
    res.redirect("/login.html");
    return;
  }

  next();
}

function requireStudentPage(req, res, next) {
  requireAuthPage(req, res, () => {
    if (req.user.role !== "student") {
      res.redirect(dashboardForRole(req.user.role));
      return;
    }

    next();
  });
}

function requireAdminPage(req, res, next) {
  requireAuthPage(req, res, () => {
    if (req.user.role !== "admin") {
      res.redirect(dashboardForRole(req.user.role));
      return;
    }

    next();
  });
}

function requireTeacherPage(req, res, next) {
  requireAuthPage(req, res, () => {
    if (req.user.role !== "teacher") {
      res.redirect(dashboardForRole(req.user.role));
      return;
    }

    next();
  });
}

function requireSystemAdminPage(req, res, next) {
  requireAuthPage(req, res, () => {
    if (req.user.role !== "system_admin") {
      res.redirect(dashboardForRole(req.user.role));
      return;
    }

    next();
  });
}

function requireAuthApi(req, res, next) {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Please log in first."
    });
    return;
  }

  next();
}

function requireStudentApi(req, res, next) {
  requireAuthApi(req, res, () => {
    if (req.user.role !== "student") {
      res.status(403).json({
        success: false,
        message: "Student access is required."
      });
      return;
    }

    next();
  });
}

function requireAdminApi(req, res, next) {
  requireAuthApi(req, res, () => {
    if (req.user.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Admin access is required."
      });
      return;
    }

    next();
  });
}

function requireTeacherApi(req, res, next) {
  requireAuthApi(req, res, () => {
    if (req.user.role !== "teacher") {
      res.status(403).json({
        success: false,
        message: "Teacher access is required."
      });
      return;
    }

    next();
  });
}

function requireSystemAdminApi(req, res, next) {
  requireAuthApi(req, res, () => {
    if (req.user.role !== "system_admin") {
      res.status(403).json({
        success: false,
        message: "System administrator access is required."
      });
      return;
    }

    next();
  });
}

function toSafeUser(user) {
  const subjectIds =
    Array.isArray(user.subjectIds) ? user.subjectIds : parseJsonArray(user.subjectsJson);
  const badges =
    Array.isArray(user.badges) ? user.badges : parseJsonArray(user.badgesJson);

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    roleLabel: formatRoleLabel(user.role),
    displayName: user.displayName,
    gradeLevel: user.gradeLevel || "Grade 10",
    subjectIds,
    points: Number(user.points || 0),
    badges
  };
}

async function getPublicSubjectCatalog() {
  const rows = await all(
    `
      SELECT
        id,
        name,
        summary,
        COALESCE(NULLIF(grade_level, ''), 'Grade 10') AS gradeLevel
      FROM subjects
      ORDER BY sort_order ASC, name ASC
    `
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    gradeLevel: row.gradeLevel
  }));
}

async function getAllContent(user = null) {
  const subjects = await all(
    `
      SELECT
        id,
        name,
        summary,
        sort_order AS sortOrder,
        COALESCE(NULLIF(grade_level, ''), 'Grade 10') AS gradeLevel,
        COALESCE(NULLIF(teacher_username, ''), 'teacher') AS teacherUsername
      FROM subjects
      ORDER BY sort_order ASC, name ASC
    `
  );
  const lessons = await all(
    `
      SELECT subject_id AS subjectId, title, grade, image_label AS imageLabel, body_json AS bodyJson
      FROM lessons
    `
  );
  const questions = await all(
    `
      SELECT
        subject_id AS subjectId,
        prompt,
        options_json AS optionsJson,
        answer_index AS answerIndex,
        sort_order AS sortOrder,
        explanation_text AS explanation,
        COALESCE(NULLIF(question_type, ''), 'multiple_choice') AS type,
        COALESCE(answer_text, '') AS answerText
      FROM quiz_questions
      ORDER BY sort_order ASC, id ASC
    `
  );

  const lessonMap = new Map();
  for (const lesson of lessons) {
    lessonMap.set(lesson.subjectId, {
      title: lesson.title,
      grade: lesson.grade,
      imageLabel: lesson.imageLabel,
      paragraphs: JSON.parse(lesson.bodyJson)
    });
  }

  const quizMap = new Map();
  for (const question of questions) {
    const subjectQuestions = quizMap.get(question.subjectId) || [];
    const options = parseJsonArray(question.optionsJson);
    const correctOption = options[question.answerIndex] || "the correct answer";
    subjectQuestions.push({
      type: normalizeQuestionType(question.type),
      prompt: question.prompt,
      options,
      answerIndex: question.answerIndex,
      answerText: question.answerText || correctOption,
      explanation:
        question.explanation ||
        `The correct answer is ${question.answerText || correctOption}. Review the lesson example before your next attempt.`
    });
    quizMap.set(question.subjectId, subjectQuestions);
  }

  const mappedSubjects = subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    summary: subject.summary,
    gradeLevel: subject.gradeLevel,
    teacherUsername: subject.teacherUsername,
    lesson: lessonMap.get(subject.id) || {
      title: subject.name,
      grade: subject.gradeLevel || "General",
      imageLabel: subject.name,
      paragraphs: []
    },
    quiz: quizMap.get(subject.id) || []
  }));

  return filterContentForUser(mappedSubjects, user);
}

function filterContentForUser(subjects, user) {
  if (!user || user.role === "admin" || user.role === "system_admin") {
    return subjects;
  }

  const subjectIds =
    Array.isArray(user.subjectIds) ? user.subjectIds : parseJsonArray(user.subjectsJson);

  if (user.role === "teacher") {
    const teacherSubjects = subjects.filter(
      (subject) =>
        subject.teacherUsername === user.username || subjectIds.includes(subject.id)
    );
    return teacherSubjects;
  }

  const gradeMatchedSubjects = subjects.filter(
    (subject) =>
      matchesGradeLevel(subject.gradeLevel, user.gradeLevel) ||
      matchesGradeLevel(subject.lesson.grade, user.gradeLevel)
  );

  const studentVisibleSubjects = gradeMatchedSubjects.length > 0 ? gradeMatchedSubjects : subjects;
  if (subjectIds.length === 0) {
    return studentVisibleSubjects;
  }

  const preferredSubjects = studentVisibleSubjects.filter((subject) => subjectIds.includes(subject.id));
  const nonPreferredSubjects = studentVisibleSubjects.filter((subject) => !subjectIds.includes(subject.id));
  return [...preferredSubjects, ...nonPreferredSubjects];
}

async function getSubjectById(subjectId, user = null) {
  const subjects = await getAllContent(user);
  return subjects.find((subject) => subject.id === subjectId) || null;
}

async function loadUserProfileByUsername(username) {
  const user = await get(
    `
      SELECT
        id,
        username,
        role,
        display_name AS displayName,
        grade_level AS gradeLevel,
        subjects_json AS subjectsJson,
        points,
        badges_json AS badgesJson
      FROM users
      WHERE username = ?
    `,
    [username]
  );

  return user ? toSafeUser(user) : null;
}

async function getProgressForUser(user) {
  const profile = user.gradeLevel ? toSafeUser(user) : await loadUserProfileByUsername(user.username);
  const subjects = await getAllContent(profile);
  const scores = await all(
    `
      SELECT subject_id AS subjectId, score, total_questions AS totalQuestions, submitted_at AS submittedAt
      FROM scores
      WHERE username = ?
      ORDER BY datetime(submitted_at) DESC, id DESC
    `,
    [profile.username]
  );
  const completedLessons = await all(
    `
      SELECT subject_id AS subjectId
      FROM lesson_progress
      WHERE username = ?
    `,
    [profile.username]
  );
  const assignmentRows = await all(
    `
      SELECT status, COUNT(*) AS total
      FROM assignments
      WHERE username = ?
      GROUP BY status
    `,
    [profile.username]
  );
  const teacherNotes = await all(
    `
      SELECT
        subject_id AS subjectId,
        note,
        teacher_username AS teacherUsername,
        created_at AS createdAt
      FROM teacher_notes
      WHERE username = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 5
    `,
    [profile.username]
  );
  const schedules = await getStudentSchedules(profile);
  const rewards = await refreshStudentGamification(profile.username);

  const completedLessonSet = new Set(completedLessons.map((row) => row.subjectId));
  const assignmentSummary = {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  };

  for (const row of assignmentRows) {
    const statusKey = String(row.status || "").toLowerCase();
    assignmentSummary.total += row.total;

    if (statusKey === "pending") {
      assignmentSummary.pending = row.total;
    } else if (statusKey === "approved") {
      assignmentSummary.approved = row.total;
    } else if (statusKey === "rejected") {
      assignmentSummary.rejected = row.total;
    }
  }

  const subjectStats = subjects.map((subject) => {
    const attempts = scores.filter((score) => score.subjectId === subject.id);
    const latestAttempt = attempts[0] || null;
    const averageScore =
      attempts.length === 0
        ? null
        : Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length);
    const progressPercent = latestAttempt
      ? latestAttempt.score
      : completedLessonSet.has(subject.id)
        ? 50
        : 0;

    return {
      id: subject.id,
      name: subject.name,
      gradeLevel: subject.gradeLevel,
      latestScore: latestAttempt ? latestAttempt.score : null,
      averageScore,
      attempts: attempts.length,
      completedLesson: completedLessonSet.has(subject.id),
      progressPercent
    };
  });

  const overallPercent =
    subjectStats.length === 0
      ? 0
      : Math.round(
          subjectStats.reduce((sum, subject) => sum + subject.progressPercent, 0) /
            subjectStats.length
        );

  const subjectNameMap = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const recentScores = scores.slice(0, 5).map((score) => ({
    subjectId: score.subjectId,
    subjectName: subjectNameMap.get(score.subjectId) || "Unknown",
    score: score.score,
    totalQuestions: score.totalQuestions,
    submittedAt: score.submittedAt
  }));

  const improvementAreas = subjectStats
    .filter(
      (subject) => !subject.completedLesson || subject.latestScore === null || subject.latestScore < 80
    )
    .sort((left, right) => (left.latestScore ?? -1) - (right.latestScore ?? -1))
    .slice(0, 3)
    .map((subject) => ({
      subjectId: subject.id,
      subjectName: subject.name,
      action:
        subject.latestScore === null
          ? "Start the lesson and take the quiz."
          : "Review the lesson examples and retry the quiz."
    }));

  return {
    overallPercent,
    completedLessons: completedLessonSet.size,
    totalLessons: subjects.length,
    profile,
    points: rewards.points,
    badges: rewards.badges,
    subjectStats,
    recentScores,
    assignments: assignmentSummary,
    improvementAreas,
    upcomingSchedules: schedules,
    teacherNotes: teacherNotes.map((note) => ({
      subjectId: note.subjectId,
      subjectName: subjectNameMap.get(note.subjectId) || note.subjectId,
      note: note.note,
      teacherUsername: note.teacherUsername,
      createdAt: note.createdAt
    }))
  };
}

async function generateQuizDraft(subject, payload) {
  const topic = String(payload.topic || subject.lesson.title || subject.name || "").trim();
  const count = Math.min(Math.max(Number(payload.count) || 5, 1), 12);
  const requestedTypes = Array.isArray(payload.types)
    ? payload.types.map(normalizeQuestionType)
    : [normalizeQuestionType(payload.type)];
  const types = [...new Set(requestedTypes)].filter(Boolean);
  const aiQuiz = await callOpenAiJson({
    system:
      "You create classroom quiz questions. Return strict JSON only with a quiz array. Supported types: multiple_choice, true_false, short_answer.",
    user: JSON.stringify({
      task: "Generate quiz questions for this topic.",
      topic,
      count,
      types,
      subject: {
        name: subject.name,
        gradeLevel: subject.gradeLevel,
        summary: subject.summary,
        lessonTitle: subject.lesson.title,
        lessonParagraphs: subject.lesson.paragraphs
      },
      schema: {
        quiz: [
          {
            type: "multiple_choice | true_false | short_answer",
            prompt: "question text",
            options: ["answer choices for multiple_choice or true_false"],
            answerIndex: 0,
            answerText: "accepted answer for short_answer",
            explanation: "student feedback"
          }
        ]
      }
    })
  });
  const normalizedQuiz = normalizeQuizPayload(aiQuiz?.quiz || aiQuiz);
  if (validateQuizPayload(normalizedQuiz) === null) {
    return normalizedQuiz.slice(0, count);
  }

  return createLocalQuizDraft(subject, { topic, count, types });
}

function createLocalQuizDraft(subject, { topic, count, types }) {
  const lessonText = subject.lesson.paragraphs.join(" ");
  const sentences = subject.lesson.paragraphs
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const sourceSentences = sentences.length > 0 ? sentences : [subject.summary || lessonText || subject.name];

  return Array.from({ length: count }, (_entry, index) => {
    const type = types[index % types.length] || "multiple_choice";
    const anchor = sourceSentences[index % sourceSentences.length];
    if (type === "true_false") {
      return {
        type,
        prompt: `True or false: ${anchor}`,
        options: ["True", "False"],
        answerIndex: 0,
        answerText: "",
        explanation: `The statement is based on the ${subject.name} lesson section about ${topic}.`
      };
    }

    if (type === "short_answer") {
      return {
        type,
        prompt: `In one short phrase, what topic is this lesson question checking?`,
        options: [],
        answerIndex: 0,
        answerText: topic,
        explanation: `A strong answer names ${topic} and connects it to the lesson.`
      };
    }

    return {
      type: "multiple_choice",
      prompt: `Which statement best matches the lesson topic "${topic}"?`,
      options: [
        anchor,
        `It is unrelated to ${subject.name}.`,
        `It should be skipped before taking the quiz.`,
        `It is only for a different grade level.`
      ],
      answerIndex: 0,
      answerText: "",
      explanation: `The first option is drawn from the current lesson material for ${subject.name}.`
    };
  });
}

async function generateAnalyticsInsight(context) {
  const aiInsight = await callOpenAiJson({
    system:
      "You are an education analytics assistant. Return strict JSON with summary, recommendations, and riskFlags arrays using concise school-ready wording.",
    user: JSON.stringify({
      task: "Analyze performance data and recommend next actions.",
      context,
      schema: {
        summary: "one sentence",
        recommendations: ["specific action"],
        riskFlags: ["short risk or gap"]
      }
    })
  });

  if (
    aiInsight &&
    typeof aiInsight.summary === "string" &&
    Array.isArray(aiInsight.recommendations) &&
    Array.isArray(aiInsight.riskFlags)
  ) {
    return {
      summary: aiInsight.summary,
      recommendations: aiInsight.recommendations.slice(0, 5).map(String),
      riskFlags: aiInsight.riskFlags.slice(0, 5).map(String),
      source: "ai"
    };
  }

  return createLocalAnalyticsInsight(context);
}

function createLocalAnalyticsInsight(context) {
  if (context.audience === "student") {
    const progress = context.progress;
    const lowSubjects = progress.subjectStats
      .filter((subject) => subject.latestScore === null || subject.latestScore < 80)
      .slice(0, 3);
    return {
      summary: `Overall progress is ${progress.overallPercent}% across ${progress.totalLessons} subjects.`,
      recommendations: lowSubjects.length
        ? lowSubjects.map((subject) => `Review ${subject.name}, then retake the quiz after the lesson examples.`)
        : ["Maintain the current pace and attempt the next scheduled quiz."],
      riskFlags: progress.assignments.pending > 0 ? ["Homework is waiting for review."] : [],
      source: "local"
    };
  }

  if (context.audience === "teacher") {
    const lowStudents = (context.students || [])
      .filter((student) => student.averageScore === null || student.averageScore < 80)
      .slice(0, 4);
    return {
      summary: `The class average is ${context.stats?.averageScore || 0}% across ${context.stats?.trackedStudents || 0} tracked students.`,
      recommendations: lowStudents.length
        ? lowStudents.map((student) => `Send a support note to ${student.displayName} with one focused review task.`)
        : ["Schedule a short mastery check for the next assigned subject."],
      riskFlags: lowStudents.map((student) => `${student.displayName} is below the 80% mastery target.`),
      source: "local"
    };
  }

  const grades = context.reports?.grades || [];
  const lowestGrade = [...grades].sort((left, right) => left.averageScore - right.averageScore)[0];
  return {
    summary: lowestGrade
      ? `${lowestGrade.gradeLevel} has the lowest current average score at ${lowestGrade.averageScore}%.`
      : "No school performance data is available yet.",
    recommendations: lowestGrade
      ? [`Review ${lowestGrade.gradeLevel} subject coverage and assign follow-up practice.`]
      : ["Create student accounts and publish quizzes to build analytics data."],
    riskFlags: lowestGrade && lowestGrade.averageScore < 75 ? [`${lowestGrade.gradeLevel} is below 75% average score.`] : [],
    source: "local"
  };
}

async function callOpenAiJson({ system, user }) {
  if (!process.env.OPENAI_API_KEY || typeof fetch !== "function") {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4
      })
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    return JSON.parse(payload.choices?.[0]?.message?.content || "{}");
  } catch (_error) {
    return null;
  }
}

async function refreshStudentGamification(username) {
  const [lessonCountRow, scoreRows] = await Promise.all([
    get(
      `
        SELECT COUNT(DISTINCT subject_id) AS total
        FROM lesson_progress
        WHERE username = ?
      `,
      [username]
    ),
    all(
      `
        SELECT score
        FROM scores
        WHERE username = ?
      `,
      [username]
    )
  ]);

  const lessonCount = lessonCountRow?.total || 0;
  const scores = scoreRows.map((row) => Number(row.score || 0));
  const averageScore =
    scores.length === 0 ? 0 : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  const points =
    lessonCount * 20 +
    scores.reduce((sum, score) => sum + Math.max(10, Math.round(score / 10) * 5), 0);
  const badges = [];

  if (lessonCount >= 1) {
    badges.push("Lesson Explorer");
  }
  if (scores.length >= 1) {
    badges.push("Quiz Starter");
  }
  if (scores.some((score) => score >= 90)) {
    badges.push("High Scorer");
  }
  if (lessonCount >= 3 && scores.length >= 3) {
    badges.push("Learning Streak");
  }
  if (scores.length >= 2 && averageScore >= 85) {
    badges.push("Mastery Builder");
  }

  await run(
    `
      UPDATE users
      SET points = ?, badges_json = ?
      WHERE username = ?
    `,
    [points, JSON.stringify(badges), username]
  );

  return {
    points,
    badges
  };
}

async function getStudentSchedules(user) {
  const subjectIds = user.subjectIds || [];
  const schedules = await all(
    `
      SELECT
        id,
        subject_id AS subjectId,
        title,
        description,
        grade_level AS gradeLevel,
        due_at AS dueAt,
        teacher_username AS teacherUsername
      FROM quiz_schedules
      WHERE active = 1
      ORDER BY datetime(due_at) ASC, id ASC
    `
  );

  return schedules
    .filter((schedule) => {
      const gradeMatches = !user.gradeLevel || schedule.gradeLevel === user.gradeLevel;
      const subjectMatches = subjectIds.length === 0 || subjectIds.includes(schedule.subjectId);
      return gradeMatches && subjectMatches;
    })
    .slice(0, 5);
}

async function ensureTeacherOwnsSubject(user, subjectId) {
  const allowedSubjectIds = await getTeacherManagedSubjectIds(user);
  if (!allowedSubjectIds.includes(subjectId)) {
    const error = new Error("You can only manage subjects assigned to your teacher account.");
    error.statusCode = 403;
    throw error;
  }
}

async function getTeacherManagedSubjectIds(user) {
  const explicitSubjectIds = Array.isArray(user.subjectIds) ? user.subjectIds : [];
  const ownedRows = await all(
    `
      SELECT id
      FROM subjects
      WHERE teacher_username = ?
      ORDER BY sort_order ASC, name ASC
    `,
    [user.username]
  );

  return [...new Set([...explicitSubjectIds, ...ownedRows.map((row) => row.id)])];
}

async function saveSubjectContent(subjectId, { name, summary, lesson, quiz, teacherUsername }) {
  await run("BEGIN TRANSACTION");
  try {
    await run(
      `
        UPDATE subjects
        SET name = ?,
            summary = ?,
            grade_level = ?,
            teacher_username = COALESCE(NULLIF(teacher_username, ''), ?)
        WHERE id = ?
      `,
      [name, summary, lesson.grade, teacherUsername || "teacher", subjectId]
    );

    const existingLesson = await get(
      "SELECT id FROM lessons WHERE subject_id = ?",
      [subjectId]
    );

    if (existingLesson) {
      await run(
        `
          UPDATE lessons
          SET title = ?, grade = ?, image_label = ?, body_json = ?
          WHERE subject_id = ?
        `,
        [
          lesson.title,
          lesson.grade,
          lesson.imageLabel,
          JSON.stringify(lesson.paragraphs),
          subjectId
        ]
      );
    } else {
      await run(
        `
          INSERT INTO lessons (subject_id, title, grade, image_label, body_json)
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          subjectId,
          lesson.title,
          lesson.grade,
          lesson.imageLabel,
          JSON.stringify(lesson.paragraphs)
        ]
      );
    }

    await run("DELETE FROM quiz_questions WHERE subject_id = ?", [subjectId]);
    for (const [questionIndex, question] of quiz.entries()) {
      await run(
        `
          INSERT INTO quiz_questions (
            subject_id,
            prompt,
            options_json,
            answer_index,
            sort_order,
            explanation_text,
            question_type,
            answer_text
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          subjectId,
          question.prompt,
          JSON.stringify(question.options),
          question.answerIndex,
          questionIndex + 1,
          question.explanation,
          question.type,
          question.answerText
        ]
      );
    }

    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
}

async function getManagedUsers({ includeRoles }) {
  const rows = await all(
    `
      SELECT
        u.id,
        u.username,
        u.role,
        u.display_name AS displayName,
        u.created_at AS createdAt,
        u.last_login_at AS lastLoginAt,
        u.grade_level AS gradeLevel,
        u.subjects_json AS subjectsJson,
        u.points,
        u.badges_json AS badgesJson,
        COALESCE(lp.lessonsCompleted, 0) AS lessonsCompleted,
        COALESCE(sc.quizAttempts, 0) AS quizAttempts,
        latest.latestScore,
        COALESCE(a.assignmentCount, 0) AS assignmentCount
      FROM users u
      LEFT JOIN (
        SELECT username, COUNT(DISTINCT subject_id) AS lessonsCompleted
        FROM lesson_progress
        GROUP BY username
      ) lp ON lp.username = u.username
      LEFT JOIN (
        SELECT username, COUNT(*) AS quizAttempts
        FROM scores
        GROUP BY username
      ) sc ON sc.username = u.username
      LEFT JOIN (
        SELECT s.username, s.score AS latestScore
        FROM scores s
        INNER JOIN (
          SELECT username, MAX(id) AS latestId
          FROM scores
          GROUP BY username
        ) latestScoreIds ON latestScoreIds.latestId = s.id
      ) latest ON latest.username = u.username
      LEFT JOIN (
        SELECT username, COUNT(*) AS assignmentCount
        FROM assignments
        GROUP BY username
      ) a ON a.username = u.username
      ORDER BY datetime(u.created_at) DESC, u.username ASC
    `
  );

  return rows
    .filter((row) => !includeRoles || includeRoles.includes(row.role))
    .map((row) => ({
      ...toSafeUser(row),
      createdAt: row.createdAt,
      lastLoginAt: row.lastLoginAt,
      lessonsCompleted: row.lessonsCompleted,
      quizAttempts: row.quizAttempts,
      latestScore: row.latestScore,
      assignmentCount: row.assignmentCount
    }));
}

async function createManagedUser({
  actor,
  username,
  displayName,
  password,
  role,
  gradeLevel,
  subjectIds
}) {
  const normalizedUsername = sanitizeUserName(username);
  const normalizedDisplayName = sanitizeDisplayName(displayName, "");
  const normalizedGradeLevel = sanitizeGradeLevel(gradeLevel);
  const normalizedRole = normalizeManagedRole(role, "student");
  const normalizedSubjectIds = normalizeSubjectSelection(subjectIds);

  const usernameValidationMessage = validateUsername(normalizedUsername);
  if (usernameValidationMessage) {
    const error = new Error(usernameValidationMessage);
    error.statusCode = 400;
    throw error;
  }

  const displayNameValidationMessage = validateDisplayName(normalizedDisplayName);
  if (displayNameValidationMessage) {
    const error = new Error(displayNameValidationMessage);
    error.statusCode = 400;
    throw error;
  }

  if (normalizedRole !== "admin" && normalizedRole !== "system_admin") {
    const gradeLevelValidationMessage = validateGradeLevel(normalizedGradeLevel);
    if (gradeLevelValidationMessage) {
      const error = new Error(gradeLevelValidationMessage);
      error.statusCode = 400;
      throw error;
    }
  }

  const passwordValidationMessage = validatePasswordForRegistration(
    String(password || "").trim(),
    normalizedUsername,
    normalizedDisplayName
  );
  if (passwordValidationMessage) {
    const error = new Error(passwordValidationMessage);
    error.statusCode = 400;
    throw error;
  }

  const validSubjectIds = await validateSubjectIdsForGrade(
    normalizedSubjectIds,
    normalizedRole === "student" || normalizedRole === "teacher" || normalizedRole === "parent"
      ? normalizedGradeLevel
      : ""
  );
  const shouldRequireSubjects = normalizedRole === "student" || normalizedRole === "teacher";
  if (shouldRequireSubjects && validSubjectIds.length === 0) {
    const error = new Error("Assign at least one subject that matches the selected grade level.");
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await get(
    "SELECT id FROM users WHERE username = ?",
    [normalizedUsername]
  );
  if (existingUser) {
    const error = new Error("That username is already registered.");
    error.statusCode = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(String(password || "").trim(), 10);
  const now = new Date().toISOString();
  const result = await run(
    `
      INSERT INTO users (
        username,
        password,
        role,
        display_name,
        created_at,
        grade_level,
        subjects_json,
        points,
        badges_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizedUsername,
      hashedPassword,
      normalizedRole,
      normalizedDisplayName,
      now,
      normalizedGradeLevel || "Grade 10",
      JSON.stringify(validSubjectIds),
      0,
      JSON.stringify([])
    ]
  );

  const createdUser = toSafeUser({
    id: result.id,
    username: normalizedUsername,
    role: normalizedRole,
    displayName: normalizedDisplayName,
    gradeLevel: normalizedGradeLevel || "Grade 10",
    subjectsJson: JSON.stringify(validSubjectIds),
    points: 0,
    badgesJson: JSON.stringify([])
  });

  if (normalizedRole === "teacher" && validSubjectIds.length > 0) {
    await run(
      `
        UPDATE subjects
        SET teacher_username = ?
        WHERE id IN (${validSubjectIds.map(() => "?").join(", ")})
      `,
      [normalizedUsername, ...validSubjectIds]
    );
  }

  await recordAudit(actor, "user_create", "user", String(result.id), {
    username: normalizedUsername,
    role: normalizedRole,
    gradeLevel: normalizedGradeLevel,
    subjectIds: validSubjectIds
  });

  return createdUser;
}

async function getAcademicReportSummary() {
  const [students, content] = await Promise.all([
    getManagedUsers({ includeRoles: ["student"] }),
    getAllContent()
  ]);

  const gradeMap = new Map();
  for (const student of students) {
    const progress = await getProgressForUser(student);
    const currentGrade = gradeMap.get(student.gradeLevel) || {
      gradeLevel: student.gradeLevel,
      studentCount: 0,
      averageProgress: 0,
      averageScore: 0,
      scoredStudents: 0
    };

    currentGrade.studentCount += 1;
    currentGrade.averageProgress += progress.overallPercent;
    const latestScores = progress.subjectStats
      .map((subject) => subject.latestScore)
      .filter((score) => Number.isFinite(score));
    if (latestScores.length > 0) {
      currentGrade.averageScore +=
        latestScores.reduce((sum, score) => sum + score, 0) / latestScores.length;
      currentGrade.scoredStudents += 1;
    }
    gradeMap.set(student.gradeLevel, currentGrade);
  }

  return {
    grades: [...gradeMap.values()].map((grade) => ({
      gradeLevel: grade.gradeLevel,
      studentCount: grade.studentCount,
      averageProgress:
        grade.studentCount === 0 ? 0 : Math.round(grade.averageProgress / grade.studentCount),
      averageScore:
        grade.scoredStudents === 0 ? 0 : Math.round(grade.averageScore / grade.scoredStudents)
    })),
    subjects: content.map((subject) => ({
      id: subject.id,
      name: subject.name,
      gradeLevel: subject.gradeLevel,
      questionCount: subject.quiz.length
    }))
  };
}

async function getTeacherStudents(user) {
  const teacherSubjectIds = await getTeacherManagedSubjectIds(user);
  const students = await getManagedUsers({ includeRoles: ["student"] });
  const matchingStudents = students.filter((student) =>
    student.subjectIds.some((subjectId) => teacherSubjectIds.includes(subjectId))
  );

  const enrichedStudents = [];
  for (const student of matchingStudents) {
    const progress = await getProgressForUser(student);
    const relevantStats = progress.subjectStats.filter((subject) =>
      teacherSubjectIds.includes(subject.id)
    );
    const latestScores = relevantStats
      .map((subject) => subject.latestScore)
      .filter((score) => Number.isFinite(score));
    enrichedStudents.push({
      ...student,
      overallPercent: progress.overallPercent,
      upcomingSchedules: progress.upcomingSchedules.length,
      improvementAreas: progress.improvementAreas,
      subjectStats: relevantStats,
      averageScore:
        latestScores.length === 0
          ? null
          : Math.round(latestScores.reduce((sum, score) => sum + score, 0) / latestScores.length)
    });
  }

  return enrichedStudents;
}

async function getTeacherSchedules(user) {
  return all(
    `
      SELECT
        id,
        subject_id AS subjectId,
        title,
        description,
        grade_level AS gradeLevel,
        due_at AS dueAt,
        active
      FROM quiz_schedules
      WHERE teacher_username = ?
      ORDER BY datetime(due_at) ASC, id ASC
    `,
    [user.username]
  );
}

async function getTeacherOverview(user) {
  const [subjects, students, schedules] = await Promise.all([
    getAllContent(user),
    getTeacherStudents(user),
    getTeacherSchedules(user)
  ]);

  const totalAverageScore = students
    .map((student) => student.averageScore)
    .filter((score) => Number.isFinite(score));

  return {
    subjects,
    students,
    schedules,
    stats: {
      assignedSubjects: subjects.length,
      trackedStudents: students.length,
      scheduledQuizzes: schedules.length,
      averageScore:
        totalAverageScore.length === 0
          ? 0
          : Math.round(
              totalAverageScore.reduce((sum, score) => sum + score, 0) / totalAverageScore.length
            )
    }
  };
}

async function getAuditLogs(limit = 60) {
  const rows = await all(
    `
      SELECT
        id,
        actor_username AS actorUsername,
        actor_role AS actorRole,
        action,
        entity_type AS entityType,
        entity_id AS entityId,
        details_json AS detailsJson,
        created_at AS createdAt
      FROM audit_logs
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `,
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    actorUsername: row.actorUsername,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    details: parseJsonObject(row.detailsJson),
    createdAt: row.createdAt
  }));
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

async function recordAudit(actor, action, entityType, entityId, details = {}) {
  if (!actor?.username || !actor?.role) {
    return;
  }

  await run(
    `
      INSERT INTO audit_logs (
        actor_username,
        actor_role,
        action,
        entity_type,
        entity_id,
        details_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      actor.username,
      actor.role,
      action,
      entityType,
      entityId || "",
      JSON.stringify(details || {}),
      new Date().toISOString()
    ]
  );
}

function listBackups() {
  ensureDirectory(BACKUP_DIR);

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((fileName) => fileName.endsWith(".db"))
    .map((fileName) => {
      const fullPath = path.join(BACKUP_DIR, fileName);
      const stats = fs.statSync(fullPath);
      return {
        fileName,
        size: stats.size,
        createdAt: stats.birthtime.toISOString()
      };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function createDatabaseBackup() {
  ensureDirectory(BACKUP_DIR);
  const fileName = `jiruedu-backup-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.db`;
  const fullPath = path.join(BACKUP_DIR, fileName);
  const sqlitePath = fullPath.replace(/\\/g, "/").replace(/'/g, "''");

  try {
    await run(`VACUUM INTO '${sqlitePath}'`);
  } catch (_error) {
    fs.copyFileSync(DATABASE_PATH, fullPath);
  }

  const stats = fs.statSync(fullPath);
  return {
    fileName,
    size: stats.size,
    createdAt: stats.birthtime.toISOString()
  };
}

async function getSystemOverview() {
  const [userRows, auditCountRow, subjectCountRow] = await Promise.all([
    all(
      `
        SELECT role, COUNT(*) AS total
        FROM users
        GROUP BY role
      `
    ),
    get("SELECT COUNT(*) AS total FROM audit_logs"),
    get("SELECT COUNT(*) AS total FROM subjects")
  ]);

  const roleCounts = {
    student: 0,
    teacher: 0,
    parent: 0,
    admin: 0,
    system_admin: 0
  };
  for (const row of userRows) {
    roleCounts[row.role] = row.total;
  }

  const uploadFiles = fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : [];
  const databaseStats = fs.statSync(DATABASE_PATH);

  return {
    stats: {
      ...roleCounts,
      subjects: subjectCountRow?.total || 0,
      auditEvents: auditCountRow?.total || 0,
      backups: listBackups().length,
      uploads: uploadFiles.length,
      databaseSize: databaseStats.size
    }
  };
}

function parseDataUrl(dataUrl, fallbackMimeType = "") {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("INVALID_DATA_URL");
  }

  const mimeType = fallbackMimeType || match[1];
  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("UPLOAD_TOO_LARGE");
  }

  return {
    mimeType,
    buffer
  };
}

function persistUpload(originalFileName, dataUrl, fallbackMimeType) {
  const parsedFile = parseDataUrl(dataUrl, fallbackMimeType);
  const extension = path.extname(originalFileName) || mimeTypeToExtension(parsedFile.mimeType);
  const storedName = `${Date.now()}-${randomUUID()}${extension}`;
  const relativePath = path.join("uploads", storedName);
  const absolutePath = path.join(DATA_DIR, relativePath);

  fs.writeFileSync(absolutePath, parsedFile.buffer);

  return {
    storedName,
    relativePath,
    mimeType: parsedFile.mimeType,
    fileSize: parsedFile.buffer.length
  };
}

function mimeTypeToExtension(mimeType) {
  const mimeMap = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "text/plain": ".txt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc"
  };

  return mimeMap[mimeType] || ".bin";
}

function toAssignmentResponse(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName || row.username,
    subjectId: row.subjectId,
    subjectName: row.subjectName || "Unknown",
    title: row.title,
    fileName: row.fileName,
    filePath: row.filePath,
    mimeType: row.mimeType,
    fileSize: row.fileSize || 0,
    status: row.status,
    score: row.score,
    feedback: row.feedback,
    reviewedBy: row.reviewedBy,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    downloadUrl: `/api/assignments/${row.id}/file`
  };
}

function openBrowser(url) {
  if (process.env.OPEN_BROWSER === "false" || process.env.NODE_ENV === "production") {
    return;
  }

  let command;
  if (process.platform === "win32") {
    command = `start "" "${url}"`;
  } else if (process.platform === "darwin") {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  try {
    exec(command, (error) => {
      if (error) {
        console.warn(`Could not open browser automatically. Open ${url} manually.`);
      }
    });
  } catch (_error) {
    console.warn(`Could not open browser automatically. Open ${url} manually.`);
  }
}

async function startServer() {
  await initializeDatabase();

  if (AUTH_SECRET === "jiruedu-dev-secret") {
    console.warn("Using the default auth secret. Set AUTH_SECRET before deploying.");
  }

  app.listen(PORT, HOST, () => {
    const localUrl = `http://localhost:${PORT}`;
    console.log(`JiruEdu running on ${HOST}:${PORT}`);
    console.log(`Local access: ${localUrl}`);
    openBrowser(localUrl);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  initializeDatabase,
  startServer
};
