const SUBJECT_KEY = "jiruedu.subject";

let contentCache = null;
let publicCatalogCache = null;
let sessionCache = undefined;
const adminDashboardState = {
  subjects: [],
  selectedSubjectId: ""
};
const teacherDashboardState = {
  subjects: [],
  students: [],
  schedules: [],
  selectedSubjectId: ""
};

document.addEventListener("DOMContentLoaded", () => {
  void initializeApp().catch(handleFatalError);
});

async function initializeApp() {
  bindLogoutButtons();
  initializePasswordToggles();

  const currentPage = getCurrentPage();
  const session = await loadSession();

  if (currentPage === "index.html") {
    initializeSplash(session);
    return;
  }

  if (currentPage === "login.html") {
    initializeLoginPage(session);
    return;
  }

  if (currentPage === "signup.html") {
    initializeSignupPage(session);
    return;
  }

  if (!session) {
    redirect("/login.html");
    return;
  }

  hydrateSession(session);
  mountSideNavigation(session.role);

  if (currentPage === "admindash.html" || currentPage === "adminrev.html") {
    if (session.role !== "admin") {
      redirect(dashboardForRole(session.role));
      return;
    }

    if (currentPage === "admindash.html") {
      await initializeAdminDashboard();
    } else if (currentPage === "adminrev.html") {
      await initializeAdminReviewPage(session);
    }

    return;
  }

  if (currentPage === "teacherdash.html") {
    if (session.role !== "teacher") {
      redirect(dashboardForRole(session.role));
      return;
    }

    await initializeTeacherDashboard();
    return;
  }

  if (currentPage === "sysadmindash.html") {
    if (session.role !== "system_admin") {
      redirect(dashboardForRole(session.role));
      return;
    }

    await initializeSystemAdminDashboard();
    return;
  }

  if (session.role !== "student") {
    redirect(dashboardForRole(session.role));
    return;
  }

  if (currentPage === "student_dashboard.html") {
    await initializeStudentDashboard();
    return;
  }

  if (currentPage === "subject.html") {
    await initializeSubjectPage();
    return;
  }

  if (currentPage === "lesson.html") {
    await initializeLessonPage();
    return;
  }

  if (currentPage === "quiz.html") {
    await initializeQuizPage();
    return;
  }

  if (currentPage === "progress.html") {
    await initializeProgressPage();
    return;
  }

  if (currentPage === "homework_upload.html") {
    await initializeHomeworkPage();
  }
}

function getCurrentPage() {
  const pathName = window.location.pathname;
  const pageName = pathName.split("/").pop();
  return pageName || "index.html";
}

function initializeSplash(session) {
  window.setTimeout(() => {
    redirect(session ? dashboardForRole(session.role) : "/login.html");
  }, 1400);
}

function initializeLoginPage(session) {
  if (session) {
    redirect(dashboardForRole(session.role));
    return;
  }

  const form = document.getElementById("login-form");
  const usernameInput = document.getElementById("login-username");
  const passwordInput = document.getElementById("login-password");
  const submitButton = document.getElementById("login-submit");
  if (!form) {
    return;
  }

  usernameInput?.addEventListener("input", () => {
    usernameInput.value = normalizeUsernameInput(usernameInput.value);
    setFieldHelp("login-username-help", "Use your student username or the seeded admin account.");
    clearStatus("login-status");
  });

  passwordInput?.addEventListener("input", () => {
    clearStatus("login-status");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = normalizeUsernameInput(usernameInput?.value || "");
    const password = passwordInput?.value || "";
    if (!username) {
      setFieldHelp("login-username-help", "Enter your username.", "error");
      setStatus("login-status", "Username is required.", "error");
      usernameInput?.focus();
      return;
    }

    if (!password) {
      setFieldHelp("login-password-help", "Enter your password.", "error");
      setStatus("login-status", "Password is required.", "error");
      passwordInput?.focus();
      return;
    }

    try {
      setButtonBusy(submitButton, true, "Signing In...");
      const response = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      sessionCache = response.user;
      setFieldHelp("login-password-help", "Login accepted. Redirecting...", "success");
      setStatus("login-status", "Login successful. Redirecting...", "success");
      redirect(response.redirectTo);
    } catch (error) {
      setFieldHelp("login-password-help", error.message, "error");
      setStatus("login-status", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false, "Login");
    }
  });
}

function initializeSignupPage(session) {
  if (session) {
    redirect(dashboardForRole(session.role));
    return;
  }

  const form = document.getElementById("signup-form");
  const displayNameInput = document.getElementById("signup-name");
  const usernameInput = document.getElementById("signup-username");
  const passwordInput = document.getElementById("signup-password");
  const confirmPasswordInput = document.getElementById("signup-confirm-password");
  const submitButton = document.getElementById("signup-submit");
  if (!form) {
    return;
  }

  const gradeLevelInput = document.getElementById("signup-grade-level");
  const subjectList = document.getElementById("signup-subject-list");
  const roleInputs = Array.from(document.querySelectorAll("input[name='signup-role']"));
  let catalogSubjects = [];
  let usernameAvailability = {
    checkedValue: "",
    available: false,
    pending: false
  };
  let usernameRequestToken = 0;

  const updateSignupRoleCopy = () => {
    const role = roleInputs.find((input) => input.checked)?.value || "student";
    const isTeacher = role === "teacher";
    const subjectLabel = document.getElementById("signup-subject-label");
    if (subjectLabel) {
      subjectLabel.textContent = isTeacher ? "Teaching Subjects" : "Preferred Subjects";
    }

    setFieldHelp(
      "signup-role-help",
      isTeacher
        ? "Teachers get a dashboard for content editing, quiz scheduling, and student support."
        : "Students get a personalized learning dashboard with progress, badges, and quiz feedback."
    );
    setFieldHelp(
      "signup-grade-help",
      isTeacher
        ? "Your main grade level helps organize your teaching dashboard."
        : "Your grade level helps personalize lessons and quizzes."
    );
    setFieldHelp(
      "signup-subject-help",
      isTeacher
        ? "Pick at least one subject you will manage as a teacher."
        : "Pick at least one subject to build your learning plan."
    );
  };

  const renderSignupSubjectsForGrade = () => {
    const selectedValues = getCheckedValues("signup-subject-list");
    renderSubjectCheckboxGroup(
      "signup-subject-list",
      filterSubjectsByGradeLevel(catalogSubjects, gradeLevelInput?.value || ""),
      selectedValues
    );
  };

  void loadPublicCatalog()
    .then((catalog) => {
      catalogSubjects = catalog.subjects || [];
      renderGradeLevelOptions("signup-grade-level", catalog.gradeLevels);
      renderSignupSubjectsForGrade();
      updateSignupRoleCopy();
      validateSignupForm();
    })
    .catch(() => {
      setStatus("signup-status", "Could not load the signup subject catalog.", "error");
    });

  const validateSignupForm = () => {
    const displayName = displayNameInput?.value.trim().replace(/\s+/g, " ") || "";
    const username = normalizeUsernameInput(usernameInput?.value || "");
    const password = passwordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";
    const gradeLevel = gradeLevelInput?.value || "";
    const subjectIds = getCheckedValues("signup-subject-list");
    const role = roleInputs.find((input) => input.checked)?.value || "student";

    if (usernameInput && usernameInput.value !== username) {
      usernameInput.value = username;
    }

    const displayNameError = validateClientDisplayName(displayName);
    const usernameError = validateClientUsername(username);
    const passwordRules = evaluateClientPassword(password, username, displayName);
    const passwordError = getPasswordValidationMessage(passwordRules);
    const confirmError =
      !confirmPassword
        ? "Confirm your password."
        : confirmPassword !== password
          ? "Passwords do not match."
          : "";
    const gradeError = !gradeLevel ? "Select your grade level." : "";
    const subjectsError = subjectIds.length === 0 ? "Pick at least one subject." : "";
    const gradeHelpText =
      role === "teacher"
        ? "Your main grade level helps organize your teaching dashboard."
        : "Your grade level helps personalize lessons and quizzes.";
    const subjectHelpText =
      role === "teacher"
        ? "Pick at least one subject you will manage as a teacher."
        : "Pick at least one subject to build your learning plan.";

    setFieldState(
      displayNameInput,
      "signup-name-help",
      displayNameError ? displayNameError : "Display name looks good.",
      displayNameError ? "error" : displayName ? "success" : ""
    );

    if (usernameError) {
      usernameAvailability = {
        checkedValue: username,
        available: false,
        pending: false
      };
      setFieldState(usernameInput, "signup-username-help", usernameError, "error");
    } else if (usernameAvailability.pending && usernameAvailability.checkedValue === username) {
      setFieldState(usernameInput, "signup-username-help", "Checking username availability...", "loading");
    } else if (usernameAvailability.checkedValue === username && usernameAvailability.available) {
      setFieldState(usernameInput, "signup-username-help", "Username is available.", "success");
    } else if (usernameAvailability.checkedValue === username && !usernameAvailability.available) {
      setFieldState(usernameInput, "signup-username-help", "That username is already taken.", "error");
    } else {
      setFieldState(
        usernameInput,
        "signup-username-help",
        "3-24 lowercase letters, numbers, dots, underscores, or hyphens.",
        ""
      );
    }

    renderPasswordRuleState(passwordRules);

    if (passwordInput) {
      passwordInput.classList.toggle("invalid", Boolean(passwordError));
      passwordInput.classList.toggle("valid", !passwordError && password.length > 0);
    }

    setFieldState(
      confirmPasswordInput,
      "signup-confirm-help",
      confirmError ? confirmError : confirmPassword ? "Passwords match." : "Re-enter the same password to continue.",
      confirmError ? "error" : confirmPassword ? "success" : ""
    );

    setFieldHelp(
      "signup-grade-help",
      gradeError || gradeHelpText,
      gradeError ? "error" : gradeLevel ? "success" : ""
    );
    setFieldHelp(
      "signup-subject-help",
      subjectsError ||
        (subjectIds.length > 0
          ? `${subjectIds.length} subject${subjectIds.length === 1 ? "" : "s"} selected.`
          : subjectHelpText),
      subjectsError ? "error" : subjectIds.length > 0 ? "success" : ""
    );

    const isAvailable =
      !usernameError &&
      usernameAvailability.checkedValue === username &&
      usernameAvailability.available &&
      !usernameAvailability.pending;
    const isValid =
      !displayNameError &&
      !usernameError &&
      !passwordError &&
      !confirmError &&
      !gradeError &&
      !subjectsError &&
      isAvailable;

    if (submitButton) {
      submitButton.disabled = !isValid;
    }

    return {
      isValid,
      username,
      displayName,
      password,
      gradeLevel,
      subjectIds,
      role
    };
  };

  const checkUsernameAvailability = async (username, { immediate = false } = {}) => {
    const usernameError = validateClientUsername(username);
    if (usernameError) {
      usernameAvailability = {
        checkedValue: username,
        available: false,
        pending: false
      };
      validateSignupForm();
      return false;
    }

    if (!immediate && usernameAvailability.checkedValue === username && !usernameAvailability.pending) {
      return usernameAvailability.available;
    }

    const requestToken = ++usernameRequestToken;
    usernameAvailability = {
      checkedValue: username,
      available: false,
      pending: true
    };
    validateSignupForm();

    try {
      const response = await apiRequest(
        `/api/auth/username-availability?username=${encodeURIComponent(username)}`
      );
      if (requestToken !== usernameRequestToken) {
        return false;
      }

      usernameAvailability = {
        checkedValue: username,
        available: response.available,
        pending: false
      };
      validateSignupForm();
      return response.available;
    } catch (_error) {
      if (requestToken !== usernameRequestToken) {
        return false;
      }

      usernameAvailability = {
        checkedValue: username,
        available: false,
        pending: false
      };
      setFieldState(usernameInput, "signup-username-help", "Could not verify username availability.", "error");
      if (submitButton) {
        submitButton.disabled = true;
      }
      return false;
    }
  };

  const scheduleAvailabilityCheck = debounce(() => {
    const username = normalizeUsernameInput(usernameInput?.value || "");
    if (validateClientUsername(username)) {
      return;
    }

    void checkUsernameAvailability(username);
  }, 350);

  displayNameInput?.addEventListener("input", () => {
    clearStatus("signup-status");
    validateSignupForm();
  });

  usernameInput?.addEventListener("input", () => {
    clearStatus("signup-status");
    usernameAvailability = {
      checkedValue: "",
      available: false,
      pending: false
    };
    validateSignupForm();
    scheduleAvailabilityCheck();
  });

  usernameInput?.addEventListener("blur", () => {
    const username = normalizeUsernameInput(usernameInput.value);
    if (!validateClientUsername(username)) {
      void checkUsernameAvailability(username, { immediate: true });
    }
  });

  passwordInput?.addEventListener("input", () => {
    clearStatus("signup-status");
    validateSignupForm();
  });

  confirmPasswordInput?.addEventListener("input", () => {
    clearStatus("signup-status");
    validateSignupForm();
  });

  gradeLevelInput?.addEventListener("change", () => {
    clearStatus("signup-status");
    renderSignupSubjectsForGrade();
    validateSignupForm();
  });

  subjectList?.addEventListener("change", () => {
    clearStatus("signup-status");
    validateSignupForm();
  });

  roleInputs.forEach((input) => {
    input.addEventListener("change", () => {
      clearStatus("signup-status");
      updateSignupRoleCopy();
      renderSignupSubjectsForGrade();
      validateSignupForm();
    });
  });

  updateSignupRoleCopy();
  validateSignupForm();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const validation = validateSignupForm();
    if (!validation.isValid) {
      setStatus("signup-status", "Fix the highlighted signup fields first.", "error");
      return;
    }

    try {
      const usernameAvailable = await checkUsernameAvailability(validation.username, { immediate: true });
      if (!usernameAvailable) {
        setStatus("signup-status", "Choose a different username to continue.", "error");
        return;
      }

      setButtonBusy(submitButton, true, "Creating Account...");
      const response = await apiRequest("/api/register", {
        method: "POST",
        body: JSON.stringify({
          displayName: validation.displayName,
          username: validation.username,
          password: validation.password,
          gradeLevel: validation.gradeLevel,
          subjectIds: validation.subjectIds,
          role: validation.role
        })
      });

      sessionCache = response.user;
      setStatus("signup-status", "Account created. Redirecting...", "success");
      redirect(response.redirectTo);
    } catch (error) {
      setStatus("signup-status", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false, "Create Account");
      validateSignupForm();
    }
  });
}

async function initializeStudentDashboard() {
  const session = await loadSession(true);
  const progress = await apiRequest("/api/progress");
  const latestScore = progress.recentScores[0] || null;

  setText(
    "dashboard-track",
    `${progress.completedLessons} of ${progress.totalLessons} lessons completed across your personalized subjects.`
  );
  setText("overall-progress-value", `${progress.overallPercent}%`);
  setText("latest-score-value", latestScore ? `${latestScore.score}%` : "No quiz yet");
  setText("assignment-status-value", `${progress.assignments.pending} pending`);
  setText("dashboard-grade-level", progress.profile.gradeLevel || session?.gradeLevel || "Grade 10");
  setText("dashboard-points-value", `${progress.points} pts`);
  setText("dashboard-badges-count", String(progress.badges.length));

  const progressBar = document.getElementById("overall-progress-bar");
  if (progressBar) {
    progressBar.style.width = `${progress.overallPercent}%`;
  }

  const subjectList = document.getElementById("dashboard-subject-list");
  if (subjectList) {
    subjectList.innerHTML = progress.subjectStats
      .map(
        (subject) => `
          <li class="summary-row">
            <span>${escapeHtml(subject.name)}</span>
            <strong>${subject.latestScore === null ? "Not started" : `${subject.latestScore}%`}</strong>
          </li>
        `
      )
      .join("");
  }

  const badgeList = document.getElementById("dashboard-badge-list");
  if (badgeList) {
    badgeList.innerHTML =
      progress.badges.length === 0
        ? `<p class="empty-state">Complete lessons and quizzes to unlock your first badge.</p>`
        : progress.badges.map((badge) => `<span class="chip">${escapeHtml(badge)}</span>`).join("");
  }

  const upcomingList = document.getElementById("dashboard-upcoming-list");
  if (upcomingList) {
    upcomingList.innerHTML =
      progress.upcomingSchedules.length === 0
        ? `<p class="empty-state">No scheduled quizzes yet.</p>`
        : progress.upcomingSchedules
            .map(
              (schedule) => `
                <li class="summary-row">
                  <span>${escapeHtml(schedule.title)}</span>
                  <strong>${escapeHtml(formatDate(schedule.dueAt))}</strong>
                </li>
              `
            )
            .join("");
  }

  await renderAiInsight("/api/progress/ai", "dashboard-ai-insight");
}

async function initializeSubjectPage() {
  const subjects = await loadContent();
  const subjectGrid = document.getElementById("subject-grid");

  if (!subjectGrid) {
    return;
  }

  if (subjects.length === 0) {
    subjectGrid.innerHTML = `<p class="empty-state">No subjects are assigned to your account yet.</p>`;
    return;
  }

  subjectGrid.innerHTML = subjects
    .map(
      (subject) => `
        <a class="subject-card subject-link" href="/lesson.html?subject=${encodeURIComponent(subject.id)}" data-subject-id="${escapeHtml(subject.id)}">
          <div class="subject-icon">${escapeHtml(subject.name.slice(0, 1))}</div>
          <h4>${escapeHtml(subject.name)}</h4>
          <span class="chip">${escapeHtml(subject.gradeLevel || subject.lesson.grade)}</span>
          <p>${escapeHtml(subject.summary)}</p>
        </a>
      `
    )
    .join("");

  subjectGrid.querySelectorAll("[data-subject-id]").forEach((link) => {
    link.addEventListener("click", () => {
      const subjectId = link.getAttribute("data-subject-id");
      if (subjectId) {
        setSelectedSubject(subjectId);
      }
    });
  });
}

async function initializeLessonPage() {
  const subject = await getCurrentSubject();

  setText("lesson-page-title", `${subject.name} Lesson`);
  setText("lesson-title", subject.lesson.title);
  setText("lesson-meta", `${subject.name} | ${subject.lesson.grade}`);
  setText("lesson-image-label", subject.lesson.imageLabel);

  const lessonText = document.getElementById("lesson-text");
  if (lessonText) {
    lessonText.innerHTML = subject.lesson.paragraphs
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("");
  }

  const completeButton = document.getElementById("complete-lesson-button");
  if (!completeButton) {
    return;
  }

  completeButton.addEventListener("click", async () => {
    try {
      await apiRequest("/api/lessons/complete", {
        method: "POST",
        body: JSON.stringify({ subjectId: subject.id })
      });

      setStatus("lesson-status", "Lesson marked as completed. Opening quiz...", "success");
      redirect(`/quiz.html?subject=${encodeURIComponent(subject.id)}`);
    } catch (error) {
      setStatus("lesson-status", error.message, "error");
    }
  });
}

async function initializeQuizPage() {
  const subject = await getCurrentSubject();
  const quizForm = document.getElementById("quiz-form");
  const submitButton = document.getElementById("quiz-submit-button");
  const feedbackContainer = document.getElementById("quiz-feedback");

  setText("quiz-subject-title", `${subject.name} Quiz`);

  if (!quizForm) {
    return;
  }

  quizForm.innerHTML = subject.quiz
    .map((question, questionIndex) => createQuizQuestionHtml(question, questionIndex, subject.quiz.length))
    .join("");

  quizForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(quizForm);
    const missingAnswer = subject.quiz.some((_, questionIndex) => !formData.get(`question-${questionIndex}`));

    if (missingAnswer) {
      setStatus("quiz-status", "Answer every question before submitting.", "error");
      return;
    }

    const answers = subject.quiz.map((question, questionIndex) => {
      const value = formData.get(`question-${questionIndex}`);
      return question.type === "short_answer" ? String(value || "").trim() : Number(value);
    });

    try {
      setButtonBusy(submitButton, true, "Checking Answers...");
      const response = await apiRequest("/api/scores", {
        method: "POST",
        body: JSON.stringify({
          subjectId: subject.id,
          answers
        })
      });

      setStatus(
        "quiz-status",
        `You scored ${response.score}% and earned ${response.rewards.points} total points.`,
        "success"
      );

      if (feedbackContainer) {
        feedbackContainer.innerHTML = response.feedback
          .map(
            (item, index) => `
              <article class="feedback-card ${item.isCorrect ? "correct" : "incorrect"}">
                <h4>Question ${index + 1}</h4>
                <p>${escapeHtml(item.prompt)}</p>
                <p><strong>Your answer:</strong> ${escapeHtml(item.selectedOption || "No answer")}</p>
                <p><strong>Correct answer:</strong> ${escapeHtml(item.correctOption)}</p>
                <p>${escapeHtml(item.explanation)}</p>
              </article>
            `
          )
          .join("");
      }

      quizForm.querySelectorAll("input").forEach((input) => {
        input.disabled = true;
      });

      if (submitButton) {
        submitButton.type = "button";
        setButtonBusy(submitButton, false, "Open Progress");
        submitButton.onclick = () => {
          redirect("/progress.html");
        };
      }
    } catch (error) {
      setStatus("quiz-status", error.message, "error");
      setButtonBusy(submitButton, false, "Submit Quiz");
    }
  });
}

async function initializeProgressPage() {
  const progress = await apiRequest("/api/progress");

  setText("progress-overall-value", `${progress.overallPercent}%`);
  setText(
    "progress-summary-text",
    `${progress.completedLessons} of ${progress.totalLessons} lessons completed`
  );

  const overallBar = document.getElementById("progress-overall-bar");
  if (overallBar) {
    overallBar.style.width = `${progress.overallPercent}%`;
  }

  const subjectStats = document.getElementById("subject-stats");
  if (subjectStats) {
    subjectStats.innerHTML = progress.subjectStats
      .map(
        (subject) => `
          <div class="stat-row">
            <span>${escapeHtml(subject.name)}</span>
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: ${subject.progressPercent}%"></div>
            </div>
            <span>${subject.latestScore === null ? "Pending" : `${subject.latestScore}%`}</span>
          </div>
        `
      )
      .join("");
  }

  const recentScores = document.getElementById("recent-score-list");
  if (recentScores) {
    if (progress.recentScores.length === 0) {
      recentScores.innerHTML = `<p class="empty-state">Take a quiz to see scores here.</p>`;
    } else {
      recentScores.innerHTML = progress.recentScores
        .map(
          (score) => `
            <li class="summary-row">
              <span>${escapeHtml(score.subjectName)}</span>
              <strong>${score.score}%</strong>
            </li>
          `
        )
        .join("");
    }
  }

  const assignmentSummary = document.getElementById("assignment-summary");
  if (assignmentSummary) {
    assignmentSummary.innerHTML = `
      <div class="summary-row"><span>Total submissions</span><strong>${progress.assignments.total}</strong></div>
      <div class="summary-row"><span>Pending review</span><strong>${progress.assignments.pending}</strong></div>
      <div class="summary-row"><span>Approved</span><strong>${progress.assignments.approved}</strong></div>
      <div class="summary-row"><span>Rejected</span><strong>${progress.assignments.rejected}</strong></div>
    `;
  }

  const badgeList = document.getElementById("progress-badge-list");
  if (badgeList) {
    badgeList.innerHTML =
      progress.badges.length === 0
        ? `<p class="empty-state">Badges will appear here once you complete activities.</p>`
        : progress.badges.map((badge) => `<span class="chip">${escapeHtml(badge)}</span>`).join("");
  }

  const improvementList = document.getElementById("improvement-area-list");
  if (improvementList) {
    improvementList.innerHTML =
      progress.improvementAreas.length === 0
        ? `<p class="empty-state">No improvement flags right now. Keep going.</p>`
        : progress.improvementAreas
            .map(
              (item) => `
                <li class="summary-row">
                  <span>${escapeHtml(item.subjectName)}</span>
                  <strong>${escapeHtml(item.action)}</strong>
                </li>
              `
            )
            .join("");
  }

  const teacherNoteList = document.getElementById("teacher-note-list");
  if (teacherNoteList) {
    teacherNoteList.innerHTML =
      progress.teacherNotes.length === 0
        ? `<p class="empty-state">Teachers have not left support notes yet.</p>`
        : progress.teacherNotes
            .map(
              (note) => `
                <li class="summary-row summary-row-stack">
                  <span>${escapeHtml(note.subjectName)}</span>
                  <strong>${escapeHtml(note.note)}</strong>
                </li>
              `
            )
            .join("");
  }

  const upcomingQuizList = document.getElementById("upcoming-quiz-list");
  if (upcomingQuizList) {
    upcomingQuizList.innerHTML =
      progress.upcomingSchedules.length === 0
        ? `<p class="empty-state">No scheduled quizzes at the moment.</p>`
        : progress.upcomingSchedules
            .map(
              (schedule) => `
                <li class="summary-row">
                  <span>${escapeHtml(schedule.title)}</span>
                  <strong>${escapeHtml(formatDate(schedule.dueAt))}</strong>
                </li>
              `
            )
            .join("");
  }

  await renderAiInsight("/api/progress/ai", "student-ai-insight");
}

function createQuizQuestionHtml(question, questionIndex, totalQuestions) {
  const type = question.type || "multiple_choice";
  const typeLabel = formatQuestionType(type);
  const answerControl =
    type === "short_answer"
      ? `<input class="form-control" type="text" name="question-${questionIndex}" placeholder="Type your answer">`
      : `<div class="options-list">
          ${(question.options || [])
            .map(
              (option, optionIndex) => `
                <label class="option-card">
                  <input type="radio" name="question-${questionIndex}" value="${optionIndex}">
                  <span>${escapeHtml(option)}</span>
                </label>
              `
            )
            .join("")}
        </div>`;

  return `
    <section class="question-card">
      <div class="question-card-header">
        <h4>Question ${questionIndex + 1} of ${totalQuestions}</h4>
        <span class="chip">${escapeHtml(typeLabel)}</span>
      </div>
      <p>${escapeHtml(question.prompt)}</p>
      ${answerControl}
    </section>
  `;
}

function formatQuestionType(type) {
  if (type === "true_false") {
    return "True / False";
  }
  if (type === "short_answer") {
    return "Short Answer";
  }
  return "Multiple Choice";
}

async function renderAiInsight(url, elementId) {
  const container = document.getElementById(elementId);
  if (!container) {
    return;
  }

  try {
    container.innerHTML = `<p class="empty-state">Generating recommendations...</p>`;
    const response = await apiRequest(url);
    const insight = response.insight || {};
    container.innerHTML = `
      <p class="ai-summary">${escapeHtml(insight.summary || "No recommendation data yet.")}</p>
      <div class="ai-list-grid">
        <div class="ai-list-card">
          <h5>Recommendations</h5>
          <ul class="summary-list ai-list">
            ${(insight.recommendations || [])
              .map((item) => `<li class="summary-row summary-row-stack ai-list-item ai-list-item-recommendation"><span>${escapeHtml(item)}</span></li>`)
              .join("") || `<li class="summary-row ai-list-item"><span>No recommendations yet.</span></li>`}
          </ul>
        </div>
        <div class="ai-list-card">
          <h5>Risk Flags</h5>
          <ul class="summary-list ai-list">
            ${(insight.riskFlags || [])
              .map((item) => `<li class="summary-row summary-row-stack ai-list-item ai-list-item-risk"><span>${escapeHtml(item)}</span></li>`)
              .join("") || `<li class="summary-row ai-list-item"><span>No current risk flags.</span></li>`}
          </ul>
        </div>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

async function initializeHomeworkPage() {
  const subjects = await loadContent();
  const form = document.getElementById("homework-form");
  const subjectSelect = document.getElementById("homework-subject");

  if (!form || !subjectSelect) {
    return;
  }

  subjectSelect.innerHTML = subjects
    .map(
      (subject) => `
        <option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>
      `
    )
    .join("");

  const selectedSubject = getSelectedSubject();
  if (selectedSubject && subjects.some((subject) => subject.id === selectedSubject)) {
    subjectSelect.value = selectedSubject;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const subjectId = subjectSelect.value;
    const title = document.getElementById("homework-title")?.value.trim() || "";
    const fileInput = document.getElementById("homework-file");
    const file = fileInput?.files?.[0];

    if (!file) {
      setStatus("homework-status", "Choose a file before submitting.", "error");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setStatus("homework-status", "The file must be smaller than 5 MB.", "error");
      return;
    }

    try {
      const fileData = await readFileAsDataUrl(file);
      await apiRequest("/api/assignments", {
        method: "POST",
        body: JSON.stringify({
          subjectId,
          title,
          fileName: file.name,
          fileData,
          mimeType: file.type || "application/octet-stream"
        })
      });

      setSelectedSubject(subjectId);
      form.reset();
      subjectSelect.value = subjectId;
      setStatus("homework-status", "Homework submitted successfully.", "success");
    } catch (error) {
      setStatus("homework-status", error.message, "error");
    }
  });
}

async function initializeAdminDashboard() {
  const catalog = await loadPublicCatalog();
  renderGradeLevelOptions("admin-user-grade", catalog.gradeLevels);
  renderSubjectCheckboxGroup("admin-user-subjects", catalog.subjects, []);
  renderGradeLevelOptions("admin-new-subject-grade", catalog.gradeLevels);

  bindAdminStudentForm();
  bindAdminSubjectCreateForm();
  bindAdminSubjectEditor();
  bindAiQuizGenerator("admin");

  await Promise.all([
    refreshAdminOverview(),
    refreshAdminStudents(),
    refreshAdminReports(),
    refreshAdminSubjects(),
    renderAiInsight("/api/admin/ai/analytics", "admin-ai-insight")
  ]);
}

async function refreshAdminOverview() {
  const response = await apiRequest("/api/admin/overview");
  const stats = response.stats;

  setText("admin-total-students", String(stats.students));
  setText("admin-total-teachers", String(stats.teachers || 0));
  setText("admin-total-subjects", String(stats.subjects));
  setText("admin-total-questions", String(stats.quizQuestions));
  setText("admin-total-submissions", String(stats.assignments.total));
  setText("admin-pending-submissions", String(stats.assignments.pending));
  setText("admin-total-grades", String(stats.gradeLevels || 0));

  const welcomeText = document.getElementById("admin-welcome-text");
  if (welcomeText) {
    welcomeText.textContent = `Managing ${stats.students} students, ${stats.teachers || 0} teachers, and ${stats.subjects} curriculum areas.`;
  }
}

async function refreshAdminStudents() {
  const response = await apiRequest("/api/admin/users");
  renderAdminStudentList(response.users);
}

function renderAdminStudentList(users) {
  const list = document.getElementById("admin-student-list");
  if (!list) {
    return;
  }

  if (users.length === 0) {
    list.innerHTML = `<p class="empty-state">No school accounts have been created yet.</p>`;
    return;
  }

  list.innerHTML = users
    .map(
      (student) => `
        <article class="admin-list-item">
          <h4>${escapeHtml(student.displayName)}</h4>
          <p>${escapeHtml(student.username)} | ${escapeHtml(formatRoleLabel(student.role))}</p>
          <div class="admin-meta">
            <span>Grade <strong>${escapeHtml(student.gradeLevel || "N/A")}</strong></span>
            <span>Subjects <strong>${student.subjectIds.length}</strong></span>
            <span>Created <strong>${escapeHtml(formatDate(student.createdAt))}</strong></span>
            <span>Last login <strong>${student.lastLoginAt ? escapeHtml(formatDate(student.lastLoginAt)) : "Never"}</strong></span>
            <span>Lessons <strong>${student.lessonsCompleted}</strong></span>
            <span>Quiz attempts <strong>${student.quizAttempts}</strong></span>
            <span>Latest score <strong>${student.latestScore === null || student.latestScore === undefined ? "None" : `${student.latestScore}%`}</strong></span>
            <span>Assignments <strong>${student.assignmentCount}</strong></span>
            <span>Points <strong>${student.points}</strong></span>
          </div>
        </article>
      `
    )
    .join("");
}

function bindAdminStudentForm() {
  const form = document.getElementById("admin-student-form");
  const submitButton = document.getElementById("admin-student-submit");
  const gradeSelect = document.getElementById("admin-user-grade");
  const roleSelect = document.getElementById("admin-user-role");
  if (!form || form.dataset.bound === "true") {
    return;
  }

  const rerenderAdminUserSubjects = async () => {
    const catalog = await loadPublicCatalog();
    renderSubjectCheckboxGroup(
      "admin-user-subjects",
      filterSubjectsByGradeLevel(catalog.subjects || [], gradeSelect?.value || ""),
      getCheckedValues("admin-user-subjects")
    );
  };

  form.dataset.bound = "true";
  gradeSelect?.addEventListener("change", () => {
    void rerenderAdminUserSubjects();
  });
  roleSelect?.addEventListener("change", () => {
    void rerenderAdminUserSubjects();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const displayName = document.getElementById("admin-student-name")?.value.trim().replace(/\s+/g, " ") || "";
    const username = normalizeUsernameInput(document.getElementById("admin-student-username")?.value || "");
    const password = document.getElementById("admin-student-password")?.value || "";
    const role = document.getElementById("admin-user-role")?.value || "student";
    const gradeLevel = document.getElementById("admin-user-grade")?.value || "";
    const subjectIds = getCheckedValues("admin-user-subjects");
    const passwordRules = evaluateClientPassword(password, username, displayName);

    const displayNameError = validateClientDisplayName(displayName);
    const usernameError = validateClientUsername(username);
    const passwordError = getPasswordValidationMessage(passwordRules);
    const gradeError = role === "admin" || role === "system_admin" ? "" : validateClientGradeLevel(gradeLevel);
    const subjectsError =
      role === "student" || role === "teacher"
        ? subjectIds.length === 0
          ? "Select at least one subject."
          : ""
        : "";

    if (displayNameError || usernameError || passwordError || gradeError || subjectsError) {
      setStatus(
        "admin-student-status",
        displayNameError || usernameError || passwordError || gradeError || subjectsError,
        "error"
      );
      return;
    }

    try {
      setButtonBusy(submitButton, true, "Creating...");
      await apiRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ displayName, username, password, role, gradeLevel, subjectIds })
      });

      form.reset();
      await rerenderAdminUserSubjects();
      setStatus("admin-student-status", "School account created successfully.", "success");
      await Promise.all([refreshAdminOverview(), refreshAdminStudents()]);
    } catch (error) {
      setStatus("admin-student-status", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false, "Create Account");
    }
  });
}

function bindAdminSubjectCreateForm() {
  const form = document.getElementById("admin-subject-create-form");
  const submitButton = document.getElementById("admin-subject-create-submit");
  if (!form || form.dataset.bound === "true") {
    return;
  }

  form.dataset.bound = "true";
  const subjectIdInput = document.getElementById("admin-new-subject-id");

  subjectIdInput?.addEventListener("input", () => {
    subjectIdInput.value = slugifySubjectId(subjectIdInput.value);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const subjectId = slugifySubjectId(subjectIdInput?.value || "");
    const name = document.getElementById("admin-new-subject-name")?.value.trim() || "";
    const summary = document.getElementById("admin-new-subject-summary")?.value.trim() || "";
    const gradeLevel = document.getElementById("admin-new-subject-grade")?.value || "";

    if (!subjectId || !name || !summary || !gradeLevel) {
      setStatus("admin-subject-create-status", "Subject id, name, summary, and grade are required.", "error");
      return;
    }

    try {
      setButtonBusy(submitButton, true, "Creating...");
      await apiRequest("/api/admin/subjects", {
        method: "POST",
        body: JSON.stringify({ id: subjectId, name, summary, gradeLevel })
      });

      form.reset();
      publicCatalogCache = null;
      setStatus("admin-subject-create-status", "Subject created. Add lesson and quiz content below.", "success");
      await Promise.all([
        refreshAdminOverview(),
        refreshAdminSubjects(subjectId),
        refreshAdminCatalogDependentInputs()
      ]);
    } catch (error) {
      setStatus("admin-subject-create-status", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false, "Create Subject");
    }
  });
}

function bindAdminSubjectEditor() {
  const subjectSelect = document.getElementById("admin-subject-select");
  const form = document.getElementById("admin-subject-editor-form");
  const addQuestionButton = document.getElementById("admin-add-question");
  const saveButton = document.getElementById("admin-subject-save");

  if (subjectSelect && subjectSelect.dataset.bound !== "true") {
    subjectSelect.dataset.bound = "true";
    subjectSelect.addEventListener("change", () => {
      adminDashboardState.selectedSubjectId = subjectSelect.value;
      populateAdminSubjectEditor();
      clearStatus("admin-subject-editor-status");
    });
  }

  if (addQuestionButton && addQuestionButton.dataset.bound !== "true") {
    addQuestionButton.dataset.bound = "true";
    addQuestionButton.addEventListener("click", () => {
      appendAdminQuizQuestion(defaultAdminQuestion());
      clearStatus("admin-subject-editor-status");
    });
  }

  if (!form || form.dataset.bound === "true") {
    return;
  }

  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const activeSubject = getAdminSelectedSubject();
    if (!activeSubject) {
      setStatus("admin-subject-editor-status", "Create a subject first, then edit its content.", "error");
      return;
    }

    let payload;
    try {
      payload = collectAdminSubjectPayload();
    } catch (error) {
      setStatus("admin-subject-editor-status", error.message, "error");
      return;
    }

    try {
      setButtonBusy(saveButton, true, "Saving...");
      await apiRequest(`/api/admin/subjects/${encodeURIComponent(activeSubject.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setStatus("admin-subject-editor-status", "Subject content saved successfully.", "success");
      publicCatalogCache = null;
      await Promise.all([
        refreshAdminOverview(),
        refreshAdminSubjects(activeSubject.id),
        refreshAdminCatalogDependentInputs()
      ]);
    } catch (error) {
      setStatus("admin-subject-editor-status", error.message, "error");
    } finally {
      setButtonBusy(saveButton, false, "Save Subject Content");
    }
  });
}

async function refreshAdminSubjects(selectedSubjectId = "") {
  contentCache = null;
  const response = await apiRequest("/api/content");
  adminDashboardState.subjects = response.subjects;

  const subjectSelect = document.getElementById("admin-subject-select");
  if (!subjectSelect) {
    return;
  }

  if (adminDashboardState.subjects.length === 0) {
    subjectSelect.innerHTML = `<option value="">No subjects available</option>`;
    adminDashboardState.selectedSubjectId = "";
    populateAdminSubjectEditor();
    return;
  }

  const nextSelectedSubjectId =
    selectedSubjectId ||
    adminDashboardState.selectedSubjectId ||
    adminDashboardState.subjects[0].id;

  adminDashboardState.selectedSubjectId =
    adminDashboardState.subjects.find((subject) => subject.id === nextSelectedSubjectId)?.id ||
    adminDashboardState.subjects[0].id;

  subjectSelect.innerHTML = adminDashboardState.subjects
    .map(
      (subject) => `
        <option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>
      `
    )
    .join("");
  subjectSelect.value = adminDashboardState.selectedSubjectId;

  populateAdminSubjectEditor();
}

function populateAdminSubjectEditor() {
  const subject = getAdminSelectedSubject();
  const editorForm = document.getElementById("admin-subject-editor-form");
  if (!editorForm) {
    return;
  }

  if (!subject) {
    editorForm.reset();
    const quizEditor = document.getElementById("admin-quiz-editor");
    if (quizEditor) {
      quizEditor.innerHTML = `<p class="empty-state">Create a subject to start editing lesson and quiz content.</p>`;
    }
    return;
  }

  setInputValue("admin-edit-name", subject.name);
  setInputValue("admin-edit-summary", subject.summary);
  setInputValue("admin-edit-lesson-title", subject.lesson.title);
  setInputValue("admin-edit-lesson-grade", subject.lesson.grade);
  setInputValue("admin-edit-lesson-image-label", subject.lesson.imageLabel);
  setInputValue("admin-edit-lesson-body", subject.lesson.paragraphs.join("\n\n"));

  renderAdminQuizEditor(subject.quiz);
}

function renderAdminQuizEditor(quiz) {
  const container = document.getElementById("admin-quiz-editor");
  if (!container) {
    return;
  }

  const questions = Array.isArray(quiz) && quiz.length > 0 ? quiz : [defaultAdminQuestion()];
  container.innerHTML = questions
    .map((question, index) => createAdminQuizQuestionCard(question, index))
    .join("");

  bindAdminQuizEditorActions();
}

function bindAdminQuizEditorActions() {
  const container = document.getElementById("admin-quiz-editor");
  if (!container) {
    return;
  }

  container.querySelectorAll("[data-remove-question]").forEach((button) => {
    button.addEventListener("click", () => {
      const cards = Array.from(container.querySelectorAll("[data-quiz-card]"));
      if (cards.length <= 1) {
        setStatus("admin-subject-editor-status", "Each subject needs at least one quiz question.", "error");
        return;
      }

      button.closest("[data-quiz-card]")?.remove();
      renumberAdminQuizQuestions();
      clearStatus("admin-subject-editor-status");
    });
  });

  container.querySelectorAll(".admin-question-type").forEach((select) => {
    if (select.dataset.bound === "true") {
      return;
    }
    select.dataset.bound = "true";
    select.addEventListener("change", () => {
      updateQuizQuestionCardForType(select.closest("[data-quiz-card]"));
      clearStatus("admin-subject-editor-status");
    });
    updateQuizQuestionCardForType(select.closest("[data-quiz-card]"));
  });
}

function appendAdminQuizQuestion(question) {
  const container = document.getElementById("admin-quiz-editor");
  if (!container) {
    return;
  }

  const nextIndex = container.querySelectorAll("[data-quiz-card]").length;
  container.insertAdjacentHTML("beforeend", createAdminQuizQuestionCard(question, nextIndex));
  bindAdminQuizEditorActions();
  renumberAdminQuizQuestions();
}

function renumberAdminQuizQuestions() {
  const container = document.getElementById("admin-quiz-editor");
  if (!container) {
    return;
  }

  container.querySelectorAll("[data-quiz-card]").forEach((card, index) => {
    card.setAttribute("data-question-index", String(index));
    const heading = card.querySelector("[data-question-title]");
    if (heading) {
      heading.textContent = `Question ${index + 1}`;
    }
  });
}

function createAdminQuizQuestionCard(question, index) {
  const normalizedQuestion = normalizeAdminQuestionForEditor(question);
  const optionLabels = ["A", "B", "C", "D"];
  const isShortAnswer = normalizedQuestion.type === "short_answer";

  return `
    <article class="quiz-editor-card" data-quiz-card data-question-index="${index}">
      <div class="quiz-editor-card-header">
        <h4 data-question-title>Question ${index + 1}</h4>
        <button type="button" class="btn btn-outline panel-action" data-remove-question>Remove</button>
      </div>

      <div class="form-group">
        <label>Prompt</label>
        <textarea class="admin-question-prompt" rows="3" placeholder="Write the quiz question.">${escapeHtml(normalizedQuestion.prompt)}</textarea>
      </div>

      <div class="form-group">
        <label>Question Type</label>
        <select class="form-control admin-question-type">
          <option value="multiple_choice" ${normalizedQuestion.type === "multiple_choice" ? "selected" : ""}>Multiple choice</option>
          <option value="true_false" ${normalizedQuestion.type === "true_false" ? "selected" : ""}>True / false</option>
          <option value="short_answer" ${normalizedQuestion.type === "short_answer" ? "selected" : ""}>Short answer</option>
        </select>
      </div>

      <div class="quiz-options-grid" data-option-grid ${isShortAnswer ? "hidden" : ""}>
        ${normalizedQuestion.options
          .map(
            (option, optionIndex) => `
              <div class="quiz-option-field">
                <label>Option ${optionLabels[optionIndex]}</label>
                <input type="text" class="admin-question-option" value="${escapeAttribute(option)}" placeholder="Option ${optionLabels[optionIndex]}">
              </div>
            `
          )
          .join("")}
      </div>

      <div class="form-group" data-answer-select ${isShortAnswer ? "hidden" : ""}>
        <label>Correct Answer</label>
        <select class="form-control admin-question-answer">
          ${optionLabels
            .map(
              (label, optionIndex) => `
                <option value="${optionIndex}" ${optionIndex === normalizedQuestion.answerIndex ? "selected" : ""}>Option ${label}</option>
              `
            )
            .join("")}
        </select>
      </div>

      <div class="form-group" data-short-answer ${isShortAnswer ? "" : "hidden"}>
        <label>Accepted Answer</label>
        <input type="text" class="admin-question-answer-text" value="${escapeAttribute(normalizedQuestion.answerText)}" placeholder="Accepted short answer">
      </div>

      <div class="form-group">
        <label>Explanation</label>
        <textarea class="admin-question-explanation" rows="3" placeholder="Explain why the correct answer is right and how to improve next time.">${escapeHtml(normalizedQuestion.explanation)}</textarea>
      </div>
    </article>
  `;
}

function normalizeAdminQuestionForEditor(question) {
  const type = ["multiple_choice", "true_false", "short_answer"].includes(question?.type)
    ? question.type
    : "multiple_choice";
  const options = Array.isArray(question?.options) ? [...question.options] : [];
  if (type === "true_false") {
    options.splice(0, options.length, "True", "False", "", "");
  }
  while (options.length < 4) {
    options.push("");
  }

  return {
    type,
    prompt: String(question?.prompt || ""),
    options: options.slice(0, 4).map((option) => String(option || "")),
    answerIndex: Number.isInteger(question?.answerIndex) ? question.answerIndex : 0,
    answerText: String(question?.answerText || ""),
    explanation: String(question?.explanation || "")
  };
}

function defaultAdminQuestion() {
  return {
    type: "multiple_choice",
    prompt: "",
    options: ["", "", "", ""],
    answerIndex: 0,
    answerText: "",
    explanation: ""
  };
}

function updateQuizQuestionCardForType(card) {
  if (!card) {
    return;
  }

  const type = card.querySelector(".admin-question-type")?.value || "multiple_choice";
  const optionGrid = card.querySelector("[data-option-grid]");
  const answerSelect = card.querySelector("[data-answer-select]");
  const shortAnswer = card.querySelector("[data-short-answer]");
  const optionInputs = Array.from(card.querySelectorAll(".admin-question-option"));
  const answerInput = card.querySelector(".admin-question-answer");
  const currentAnswer = answerInput?.value || "0";

  if (type === "short_answer") {
    optionGrid.hidden = true;
    answerSelect.hidden = true;
    shortAnswer.hidden = false;
    return;
  }

  optionGrid.hidden = false;
  answerSelect.hidden = false;
  shortAnswer.hidden = true;
  if (type === "true_false") {
    optionInputs.forEach((input, index) => {
      input.value = index === 0 ? "True" : index === 1 ? "False" : "";
      input.disabled = index > 1;
    });
    answerInput.innerHTML = `
      <option value="0">True</option>
      <option value="1">False</option>
    `;
    answerInput.value = currentAnswer === "1" ? "1" : "0";
    return;
  }

  optionInputs.forEach((input) => {
    input.disabled = false;
  });
  answerInput.innerHTML = ["A", "B", "C", "D"]
    .map((label, index) => `<option value="${index}">Option ${label}</option>`)
    .join("");
  answerInput.value = ["0", "1", "2", "3"].includes(currentAnswer) ? currentAnswer : "0";
}

function getAdminSelectedSubject() {
  return adminDashboardState.subjects.find(
    (subject) => subject.id === adminDashboardState.selectedSubjectId
  ) || null;
}

function collectAdminSubjectPayload() {
  const lessonParagraphs = String(document.getElementById("admin-edit-lesson-body")?.value || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const quizCards = Array.from(document.querySelectorAll("[data-quiz-card]"));
  if (quizCards.length === 0) {
    throw new Error("Add at least one quiz question before saving.");
  }

  const quiz = quizCards.map((card, index) => {
    const type = card.querySelector(".admin-question-type")?.value || "multiple_choice";
    const prompt = card.querySelector(".admin-question-prompt")?.value.trim() || "";
    const options = Array.from(card.querySelectorAll(".admin-question-option"))
      .map((input) => input.value.trim())
      .filter((option) => type !== "short_answer" || option);
    const answerText = card.querySelector(".admin-question-answer-text")?.value.trim() || "";
    const explanation = card.querySelector(".admin-question-explanation")?.value.trim() || "";
    const answerOptions = type === "short_answer" ? [] : type === "true_false" ? ["True", "False"] : options;
    const hasEmptyOption = answerOptions.some((option) => !option);

    if (!prompt) {
      throw new Error(`Question ${index + 1} needs a prompt.`);
    }

    if (type !== "short_answer" && (answerOptions.length < 2 || hasEmptyOption)) {
      throw new Error(`Question ${index + 1} needs complete answer options.`);
    }

    if (type === "short_answer" && !answerText) {
      throw new Error(`Question ${index + 1} needs an accepted short answer.`);
    }

    if (!explanation) {
      throw new Error(`Question ${index + 1} needs an explanation.`);
    }

    return {
      type,
      prompt,
      options: answerOptions,
      answerIndex: Number(card.querySelector(".admin-question-answer")?.value || 0),
      answerText,
      explanation
    };
  });

  if (lessonParagraphs.length === 0) {
    throw new Error("Lesson content must include at least one paragraph.");
  }

  return {
    name: document.getElementById("admin-edit-name")?.value.trim() || "",
    summary: document.getElementById("admin-edit-summary")?.value.trim() || "",
    lesson: {
      title: document.getElementById("admin-edit-lesson-title")?.value.trim() || "",
      grade: document.getElementById("admin-edit-lesson-grade")?.value.trim() || "",
      imageLabel: document.getElementById("admin-edit-lesson-image-label")?.value.trim() || "",
      paragraphs: lessonParagraphs
    },
    quiz
  };
}

function bindAiQuizGenerator(scope) {
  const button = document.getElementById("ai-generate-quiz-button");
  if (!button || button.dataset.bound === "true") {
    return;
  }

  button.dataset.bound = "true";
  button.addEventListener("click", async () => {
    const activeSubject = scope === "teacher" ? getTeacherSelectedSubject() : getAdminSelectedSubject();
    if (!activeSubject) {
      setStatus("admin-subject-editor-status", "Select a subject before generating quiz questions.", "error");
      return;
    }

    const topic = document.getElementById("ai-quiz-topic")?.value.trim() || activeSubject.lesson.title || activeSubject.name;
    const count = Number(document.getElementById("ai-quiz-count")?.value || 5);
    const types = getCheckedValues("ai-question-types");
    const endpoint = scope === "teacher" ? "/api/teacher/ai/quiz" : "/api/admin/ai/quiz";

    try {
      setButtonBusy(button, true, "Generating...");
      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          subjectId: activeSubject.id,
          topic,
          count,
          types
        })
      });
      renderAdminQuizEditor(response.quiz || []);
      setStatus("admin-subject-editor-status", "AI draft loaded. Review and save the subject content to publish it.", "success");
    } catch (error) {
      setStatus("admin-subject-editor-status", error.message, "error");
    } finally {
      setButtonBusy(button, false, "Generate Draft");
    }
  });
}

async function refreshAdminReports() {
  const response = await apiRequest("/api/admin/reports");
  const list = document.getElementById("admin-report-list");
  if (!list) {
    return;
  }

  const gradeCards = response.reports.grades
    .map(
      (grade) => `
        <article class="admin-list-item">
          <h4>${escapeHtml(grade.gradeLevel)}</h4>
          <div class="admin-meta">
            <span>Students <strong>${grade.studentCount}</strong></span>
            <span>Avg progress <strong>${grade.averageProgress}%</strong></span>
            <span>Avg score <strong>${grade.averageScore}%</strong></span>
          </div>
        </article>
      `
    )
    .join("");

  list.innerHTML = gradeCards || `<p class="empty-state">No academic report data yet.</p>`;
}

async function initializeTeacherDashboard() {
  bindTeacherSubjectEditor();
  bindTeacherScheduleForm();
  bindTeacherNoteForm();
  bindAiQuizGenerator("teacher");

  await Promise.all([
    refreshTeacherOverview(),
    refreshTeacherStudents(),
    refreshTeacherSchedules(),
    renderAiInsight("/api/teacher/ai/analytics", "teacher-ai-insight")
  ]);
}

async function refreshTeacherOverview() {
  const response = await apiRequest("/api/teacher/overview");
  teacherDashboardState.subjects = response.subjects || [];

  setText("teacher-assigned-subjects", String(response.stats.assignedSubjects || 0));
  setText("teacher-tracked-students", String(response.stats.trackedStudents || 0));
  setText("teacher-scheduled-quizzes", String(response.stats.scheduledQuizzes || 0));
  setText("teacher-average-score", `${response.stats.averageScore || 0}%`);

  const welcomeText = document.getElementById("teacher-welcome-text");
  if (welcomeText) {
    welcomeText.textContent = `You are managing ${response.stats.assignedSubjects || 0} subjects and tracking ${response.stats.trackedStudents || 0} students.`;
  }

  refreshTeacherSubjects();
  populateTeacherScheduleSubjects();
}

function refreshTeacherSubjects(selectedSubjectId = "") {
  const subjectSelect = document.getElementById("admin-subject-select");
  if (!subjectSelect) {
    return;
  }

  if (teacherDashboardState.subjects.length === 0) {
    subjectSelect.innerHTML = `<option value="">No assigned subjects</option>`;
    teacherDashboardState.selectedSubjectId = "";
    populateTeacherSubjectEditor();
    return;
  }

  const nextSelectedSubjectId =
    selectedSubjectId ||
    teacherDashboardState.selectedSubjectId ||
    teacherDashboardState.subjects[0].id;

  teacherDashboardState.selectedSubjectId =
    teacherDashboardState.subjects.find((subject) => subject.id === nextSelectedSubjectId)?.id ||
    teacherDashboardState.subjects[0].id;

  subjectSelect.innerHTML = teacherDashboardState.subjects
    .map(
      (subject) => `
        <option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>
      `
    )
    .join("");
  subjectSelect.value = teacherDashboardState.selectedSubjectId;

  populateTeacherSubjectEditor();
}

function populateTeacherSubjectEditor() {
  const subject = getTeacherSelectedSubject();
  const editorForm = document.getElementById("admin-subject-editor-form");
  if (!editorForm) {
    return;
  }

  if (!subject) {
    editorForm.reset();
    const quizEditor = document.getElementById("admin-quiz-editor");
    if (quizEditor) {
      quizEditor.innerHTML = `<p class="empty-state">No assigned subject content is available yet.</p>`;
    }
    return;
  }

  setInputValue("admin-edit-name", subject.name);
  setInputValue("admin-edit-summary", subject.summary);
  setInputValue("admin-edit-lesson-title", subject.lesson.title);
  setInputValue("admin-edit-lesson-grade", subject.lesson.grade);
  setInputValue("admin-edit-lesson-image-label", subject.lesson.imageLabel);
  setInputValue("admin-edit-lesson-body", subject.lesson.paragraphs.join("\n\n"));
  renderAdminQuizEditor(subject.quiz);
}

function getTeacherSelectedSubject() {
  return teacherDashboardState.subjects.find(
    (subject) => subject.id === teacherDashboardState.selectedSubjectId
  ) || null;
}

function bindTeacherSubjectEditor() {
  const subjectSelect = document.getElementById("admin-subject-select");
  const form = document.getElementById("admin-subject-editor-form");
  const addQuestionButton = document.getElementById("admin-add-question");
  const saveButton = document.getElementById("admin-subject-save");

  if (subjectSelect && subjectSelect.dataset.teacherBound !== "true") {
    subjectSelect.dataset.teacherBound = "true";
    subjectSelect.addEventListener("change", () => {
      teacherDashboardState.selectedSubjectId = subjectSelect.value;
      populateTeacherSubjectEditor();
      clearStatus("admin-subject-editor-status");
    });
  }

  if (addQuestionButton && addQuestionButton.dataset.teacherBound !== "true") {
    addQuestionButton.dataset.teacherBound = "true";
    addQuestionButton.addEventListener("click", () => {
      appendAdminQuizQuestion(defaultAdminQuestion());
      clearStatus("admin-subject-editor-status");
    });
  }

  if (!form || form.dataset.teacherBound === "true") {
    return;
  }

  form.dataset.teacherBound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const activeSubject = getTeacherSelectedSubject();
    if (!activeSubject) {
      setStatus("admin-subject-editor-status", "No assigned subject is selected.", "error");
      return;
    }

    let payload;
    try {
      payload = collectAdminSubjectPayload();
    } catch (error) {
      setStatus("admin-subject-editor-status", error.message, "error");
      return;
    }

    try {
      setButtonBusy(saveButton, true, "Saving...");
      await apiRequest(`/api/teacher/subjects/${encodeURIComponent(activeSubject.id)}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      setStatus("admin-subject-editor-status", "Teaching content updated successfully.", "success");
      publicCatalogCache = null;
      await refreshTeacherOverview();
    } catch (error) {
      setStatus("admin-subject-editor-status", error.message, "error");
    } finally {
      setButtonBusy(saveButton, false, "Save Subject Content");
    }
  });
}

async function refreshTeacherStudents() {
  const response = await apiRequest("/api/teacher/students");
  teacherDashboardState.students = response.students || [];
  renderTeacherStudentList(teacherDashboardState.students);
  populateTeacherStudentOptions();
}

function renderTeacherStudentList(students) {
  const list = document.getElementById("teacher-student-list");
  if (!list) {
    return;
  }

  if (students.length === 0) {
    list.innerHTML = `<p class="empty-state">No students are assigned to your subjects yet.</p>`;
    return;
  }

  list.innerHTML = students
    .map(
      (student) => `
        <article class="admin-list-item">
          <h4>${escapeHtml(student.displayName)}</h4>
          <p>${escapeHtml(student.gradeLevel)} | ${escapeHtml(student.username)}</p>
          <div class="admin-meta">
            <span>Progress <strong>${student.overallPercent}%</strong></span>
            <span>Average score <strong>${student.averageScore === null ? "N/A" : `${student.averageScore}%`}</strong></span>
            <span>Badges <strong>${student.badges.length}</strong></span>
            <span>Points <strong>${student.points}</strong></span>
          </div>
        </article>
      `
    )
    .join("");
}

function populateTeacherStudentOptions() {
  const studentSelect = document.getElementById("teacher-note-student");
  if (!studentSelect) {
    return;
  }

  studentSelect.innerHTML =
    teacherDashboardState.students.length === 0
      ? `<option value="">No students available</option>`
      : teacherDashboardState.students
          .map(
            (student) => `
              <option value="${escapeHtml(student.username)}">${escapeHtml(student.displayName)} (${escapeHtml(student.gradeLevel)})</option>
            `
          )
          .join("");
}

async function refreshTeacherSchedules() {
  const response = await apiRequest("/api/teacher/schedules");
  teacherDashboardState.schedules = response.schedules || [];
  renderTeacherScheduleList(teacherDashboardState.schedules);
}

function renderTeacherScheduleList(schedules) {
  const list = document.getElementById("teacher-schedule-list");
  if (!list) {
    return;
  }

  if (schedules.length === 0) {
    list.innerHTML = `<p class="empty-state">No quizzes are scheduled yet.</p>`;
    return;
  }

  list.innerHTML = schedules
    .map(
      (schedule) => `
        <article class="admin-list-item">
          <h4>${escapeHtml(schedule.title)}</h4>
          <div class="admin-meta">
            <span>Subject <strong>${escapeHtml(schedule.subjectId)}</strong></span>
            <span>Grade <strong>${escapeHtml(schedule.gradeLevel)}</strong></span>
            <span>Due <strong>${escapeHtml(formatDate(schedule.dueAt))}</strong></span>
          </div>
          <p>${escapeHtml(schedule.description || "No extra instructions.")}</p>
        </article>
      `
    )
    .join("");
}

function populateTeacherScheduleSubjects() {
  const subjectSelect = document.getElementById("teacher-schedule-subject");
  const noteSubjectSelect = document.getElementById("teacher-note-subject");
  const optionsHtml =
    teacherDashboardState.subjects.length === 0
      ? `<option value="">No subjects available</option>`
      : teacherDashboardState.subjects
          .map(
            (subject) => `
              <option value="${escapeHtml(subject.id)}">${escapeHtml(subject.name)}</option>
            `
          )
          .join("");

  if (subjectSelect) {
    subjectSelect.innerHTML = optionsHtml;
  }
  if (noteSubjectSelect) {
    noteSubjectSelect.innerHTML = optionsHtml;
  }
}

function bindTeacherScheduleForm() {
  const form = document.getElementById("teacher-schedule-form");
  const submitButton = document.getElementById("teacher-schedule-submit");
  if (!form || form.dataset.bound === "true") {
    return;
  }

  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const subjectId = document.getElementById("teacher-schedule-subject")?.value || "";
    const title = document.getElementById("teacher-schedule-title")?.value.trim() || "";
    const gradeLevel = document.getElementById("teacher-schedule-grade")?.value.trim() || "";
    const dueAt = document.getElementById("teacher-schedule-due-at")?.value || "";
    const description = document.getElementById("teacher-schedule-description")?.value.trim() || "";

    if (!subjectId || !title || !gradeLevel || !dueAt) {
      setStatus("teacher-schedule-status", "Subject, title, grade, and deadline are required.", "error");
      return;
    }

    try {
      setButtonBusy(submitButton, true, "Scheduling...");
      await apiRequest("/api/teacher/schedules", {
        method: "POST",
        body: JSON.stringify({ subjectId, title, gradeLevel, dueAt, description })
      });

      form.reset();
      setStatus("teacher-schedule-status", "Quiz schedule created successfully.", "success");
      await Promise.all([refreshTeacherOverview(), refreshTeacherSchedules()]);
    } catch (error) {
      setStatus("teacher-schedule-status", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false, "Schedule Quiz");
    }
  });
}

function bindTeacherNoteForm() {
  const form = document.getElementById("teacher-note-form");
  const submitButton = document.getElementById("teacher-note-submit");
  if (!form || form.dataset.bound === "true") {
    return;
  }

  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("teacher-note-student")?.value || "";
    const subjectId = document.getElementById("teacher-note-subject")?.value || "";
    const note = document.getElementById("teacher-note-message")?.value.trim() || "";

    if (!username || !subjectId || !note) {
      setStatus("teacher-note-status", "Student, subject, and note are required.", "error");
      return;
    }

    try {
      setButtonBusy(submitButton, true, "Sending...");
      await apiRequest("/api/teacher/notes", {
        method: "POST",
        body: JSON.stringify({ username, subjectId, note })
      });

      form.reset();
      setStatus("teacher-note-status", "Support note sent to the student dashboard.", "success");
    } catch (error) {
      setStatus("teacher-note-status", error.message, "error");
    } finally {
      setButtonBusy(submitButton, false, "Send Support Note");
    }
  });
}

async function initializeSystemAdminDashboard() {
  bindSystemBackupButton();
  await Promise.all([
    refreshSystemOverview(),
    refreshSystemUsers(),
    refreshSystemPermissions(),
    refreshSystemAudit(),
    refreshSystemBackups()
  ]);
}

async function refreshSystemOverview() {
  const response = await apiRequest("/api/system/overview");
  const stats = response.stats;

  setText("system-total-users", String((stats.student || 0) + (stats.teacher || 0) + (stats.admin || 0) + (stats.system_admin || 0) + (stats.parent || 0)));
  setText("system-total-teachers", String(stats.teacher || 0));
  setText("system-total-admins", String((stats.admin || 0) + (stats.system_admin || 0)));
  setText("system-total-audit", String(stats.auditEvents || 0));
  setText("system-backup-count", String(stats.backups || 0));
  setText("system-db-size", formatBytes(stats.databaseSize || 0));
}

async function refreshSystemUsers() {
  const response = await apiRequest("/api/system/users");
  renderSystemUserList(response.users);
}

function renderSystemUserList(users) {
  const list = document.getElementById("system-user-list");
  if (!list) {
    return;
  }

  list.innerHTML = users
    .map(
      (user) => `
        <article class="admin-list-item" data-system-user-id="${user.id}">
          <h4>${escapeHtml(user.displayName)}</h4>
          <p>${escapeHtml(user.username)}</p>
          <div class="admin-editor-grid">
            <div class="form-group">
              <label>Role</label>
              <select class="form-control system-user-role">
                ${["student", "teacher", "parent", "admin", "system_admin"]
                  .map(
                    (role) => `
                      <option value="${role}" ${role === user.role ? "selected" : ""}>${escapeHtml(formatRoleLabel(role))}</option>
                    `
                  )
                  .join("")}
              </select>
            </div>
            <div class="form-group">
              <label>Grade Level</label>
              <input type="text" class="system-user-grade" value="${escapeAttribute(user.gradeLevel || "")}">
            </div>
          </div>
          <div class="form-group">
            <label>Subjects (comma separated ids)</label>
            <input type="text" class="system-user-subjects" value="${escapeAttribute(user.subjectIds.join(", "))}">
          </div>
          <button type="button" class="btn btn-outline system-user-save">Save Access</button>
        </article>
      `
    )
    .join("");

  list.querySelectorAll(".system-user-save").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-system-user-id]");
      if (!card) {
        return;
      }

      const userId = card.getAttribute("data-system-user-id");
      const role = card.querySelector(".system-user-role")?.value || "student";
      const gradeLevel = card.querySelector(".system-user-grade")?.value.trim() || "";
      const subjectIds = card.querySelector(".system-user-subjects")?.value || "";

      try {
        setButtonBusy(button, true, "Saving...");
        await apiRequest(`/api/system/users/${encodeURIComponent(userId)}`, {
          method: "PUT",
          body: JSON.stringify({
            role,
            gradeLevel,
            subjectIds: subjectIds
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          })
        });

        setStatus("system-dashboard-status", "User access updated.", "success");
        await Promise.all([refreshSystemUsers(), refreshSystemAudit()]);
      } catch (error) {
        setStatus("system-dashboard-status", error.message, "error");
      } finally {
        setButtonBusy(button, false, "Save Access");
      }
    });
  });
}

async function refreshSystemPermissions() {
  const response = await apiRequest("/api/system/permissions");
  const list = document.getElementById("system-permission-list");
  if (!list) {
    return;
  }

  list.innerHTML = Object.entries(response.permissions)
    .map(
      ([role, permissions]) => `
        <article class="admin-list-item">
          <h4>${escapeHtml(formatRoleLabel(role))}</h4>
          <p>${permissions.map((permission) => escapeHtml(permission)).join(" | ")}</p>
        </article>
      `
    )
    .join("");
}

async function refreshSystemAudit() {
  const response = await apiRequest("/api/system/audit");
  const list = document.getElementById("system-audit-list");
  if (!list) {
    return;
  }

  list.innerHTML =
    response.logs.length === 0
      ? `<p class="empty-state">No audit activity has been recorded yet.</p>`
      : response.logs
          .map(
            (log) => `
              <article class="admin-list-item">
                <h4>${escapeHtml(log.action)}</h4>
                <p>${escapeHtml(log.actorUsername)} | ${escapeHtml(formatRoleLabel(log.actorRole))}</p>
                <div class="admin-meta">
                  <span>Entity <strong>${escapeHtml(log.entityType)}</strong></span>
                  <span>When <strong>${escapeHtml(formatDate(log.createdAt))}</strong></span>
                </div>
              </article>
            `
          )
          .join("");
}

async function refreshSystemBackups() {
  const response = await apiRequest("/api/system/backups");
  const list = document.getElementById("system-backup-list");
  if (!list) {
    return;
  }

  list.innerHTML =
    response.backups.length === 0
      ? `<p class="empty-state">No database backups have been created yet.</p>`
      : response.backups
          .map(
            (backup) => `
              <article class="admin-list-item">
                <h4>${escapeHtml(backup.fileName)}</h4>
                <div class="admin-meta">
                  <span>Created <strong>${escapeHtml(formatDate(backup.createdAt))}</strong></span>
                  <span>Size <strong>${escapeHtml(formatBytes(backup.size))}</strong></span>
                </div>
              </article>
            `
          )
          .join("");
}

function bindSystemBackupButton() {
  const button = document.getElementById("system-backup-create");
  if (!button || button.dataset.bound === "true") {
    return;
  }

  button.dataset.bound = "true";
  button.addEventListener("click", async () => {
    try {
      setButtonBusy(button, true, "Creating Backup...");
      await apiRequest("/api/system/backups", {
        method: "POST"
      });
      setStatus("system-dashboard-status", "Database backup created successfully.", "success");
      await Promise.all([refreshSystemOverview(), refreshSystemBackups(), refreshSystemAudit()]);
    } catch (error) {
      setStatus("system-dashboard-status", error.message, "error");
    } finally {
      setButtonBusy(button, false, "Create Database Backup");
    }
  });
}

async function initializeAdminReviewPage(session) {
  const container = document.getElementById("assignment-list");
  if (!container) {
    return;
  }

  const response = await apiRequest("/api/assignments");
  const assignments = response.assignments;

  if (assignments.length === 0) {
    container.innerHTML = `<p class="empty-state">No homework submissions have been uploaded yet.</p>`;
    return;
  }

  container.innerHTML = assignments
    .map(
      (assignment) => `
        <article class="review-card" data-assignment-id="${assignment.id}">
          <div class="review-header">
            <div>
              <h4>${escapeHtml(assignment.displayName)}</h4>
              <p>${escapeHtml(assignment.subjectName)} | ${escapeHtml(assignment.title)}</p>
            </div>
            <span class="badge ${assignment.status.toLowerCase()}">${escapeHtml(assignment.status)}</span>
          </div>

          <div class="review-body">
            <a class="file-link" href="${escapeAttribute(assignment.downloadUrl)}">
              Open ${escapeHtml(assignment.fileName)}
            </a>

            <p class="review-meta">Submitted ${escapeHtml(formatDate(assignment.submittedAt))}</p>

            <div class="grading-form">
              <div class="form-group">
                <label for="score-${assignment.id}">Score (0-100)</label>
                <input id="score-${assignment.id}" type="number" min="0" max="100" value="${assignment.score ?? ""}">
              </div>
              <div class="form-group">
                <label for="feedback-${assignment.id}">Feedback</label>
                <textarea id="feedback-${assignment.id}" rows="3" placeholder="Enter feedback...">${escapeHtml(assignment.feedback || "")}</textarea>
              </div>
            </div>
          </div>

          <div class="review-actions">
            <button class="btn btn-danger" data-review-status="Rejected">Reject</button>
            <button class="btn btn-success" data-review-status="Approved">Approve</button>
          </div>
        </article>
      `
    )
    .join("");

  container.querySelectorAll("[data-review-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-assignment-id]");
      if (!card) {
        return;
      }

      const assignmentId = card.getAttribute("data-assignment-id");
      const status = button.getAttribute("data-review-status");
      const score = card.querySelector("input[type='number']")?.value ?? "";
      const feedback = card.querySelector("textarea")?.value ?? "";

      try {
        await apiRequest(`/api/assignments/${assignmentId}/review`, {
          method: "POST",
          body: JSON.stringify({
            status,
            score,
            feedback,
            reviewedBy: session.username
          })
        });

        setStatus(
          "admin-review-status",
          `Assignment ${assignmentId} marked as ${status.toLowerCase()}.`,
          "success"
        );
        await initializeAdminReviewPage(session);
      } catch (error) {
        setStatus("admin-review-status", error.message, "error");
      }
    });
  });
}

async function loadContent(force = false) {
  if (!force && contentCache) {
    return contentCache;
  }

  const response = await apiRequest("/api/content");
  contentCache = response.subjects;
  return contentCache;
}

async function loadPublicCatalog(force = false) {
  if (!force && publicCatalogCache) {
    return publicCatalogCache;
  }

  const response = await apiRequest("/api/public/catalog");
  publicCatalogCache = response;
  return publicCatalogCache;
}

async function getCurrentSubject() {
  const subjects = await loadContent();
  const querySubject = new URLSearchParams(window.location.search).get("subject");
  const selectedSubject = getSelectedSubject();
  const activeSubjectId = querySubject || selectedSubject || subjects[0]?.id;
  const subject = subjects.find((entry) => entry.id === activeSubjectId) || subjects[0];

  if (subject) {
    setSelectedSubject(subject.id);
  }

  return subject;
}

function bindLogoutButtons() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await apiRequest("/api/logout", {
          method: "POST"
        });
      } catch (_error) {
        // Ignore logout request errors and fall through to login.
      }

      sessionCache = null;
      redirect("/login.html");
    });
  });
}

function initializePasswordToggles() {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const inputId = button.getAttribute("data-toggle-password");
      const input = inputId ? document.getElementById(inputId) : null;
      if (!input) {
        return;
      }

      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      button.textContent = isPassword ? "Hide" : "Show";
      button.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  });
}

function normalizeUsernameInput(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}

function validateClientGradeLevel(gradeLevel) {
  if (!gradeLevel) {
    return "Grade level is required.";
  }

  if (gradeLevel.length < 3 || gradeLevel.length > 30) {
    return "Grade level must be 3-30 characters long.";
  }

  return "";
}

function validateClientDisplayName(displayName) {
  if (!displayName) {
    return "Display name is required.";
  }

  if (displayName.length < 2 || displayName.length > 50) {
    return "Display name must be 2-50 characters long.";
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9 .'-]*$/.test(displayName)) {
    return "Display name contains unsupported characters.";
  }

  return "";
}

function validateClientUsername(username) {
  if (!username) {
    return "Username is required.";
  }

  if (username.length < 3 || username.length > 24) {
    return "Username must be 3-24 characters long.";
  }

  if (!/^[a-z0-9._-]+$/.test(username)) {
    return "Use only lowercase letters, numbers, dots, underscores, or hyphens.";
  }

  if (!/^[a-z0-9]/.test(username) || !/[a-z0-9]$/.test(username)) {
    return "Username must start and end with a letter or number.";
  }

  if (/[._-]{2,}/.test(username)) {
    return "Username cannot contain repeated separators.";
  }

  return "";
}

function evaluateClientPassword(password, username, displayName) {
  const compactDisplayName = String(displayName || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const loweredPassword = String(password || "").toLowerCase();

  return {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    avoidsUsername: username ? !loweredPassword.includes(username) : true,
    avoidsDisplayName:
      compactDisplayName && compactDisplayName.length >= 4
        ? !loweredPassword.includes(compactDisplayName)
        : true
  };
}

function getPasswordValidationMessage(ruleState) {
  if (!ruleState.length) {
    return "Password must be at least 8 characters long.";
  }

  if (!ruleState.lower) {
    return "Password must include a lowercase letter.";
  }

  if (!ruleState.upper) {
    return "Password must include an uppercase letter.";
  }

  if (!ruleState.number) {
    return "Password must include a number.";
  }

  if (!ruleState.avoidsUsername) {
    return "Password cannot contain your username.";
  }

  if (!ruleState.avoidsDisplayName) {
    return "Password is too close to your display name.";
  }

  return "";
}

function renderPasswordRuleState(ruleState) {
  const ruleMap = {
    "rule-length": ruleState.length,
    "rule-lower": ruleState.lower,
    "rule-upper": ruleState.upper,
    "rule-number": ruleState.number
  };

  Object.entries(ruleMap).forEach(([elementId, isValid]) => {
    const element = document.getElementById(elementId);
    if (!element) {
      return;
    }

    element.classList.toggle("valid", isValid);
    element.classList.toggle("invalid", !isValid);
  });

  const strengthBar = document.getElementById("signup-password-strength-bar");
  if (!strengthBar) {
    return;
  }

  const score = Object.values(ruleState).reduce(
    (total, isValid) => total + (isValid ? 1 : 0),
    0
  );
  const strengthPercent = Math.min(100, Math.max(0, Math.round((score / 6) * 100)));

  strengthBar.style.width = `${strengthPercent}%`;
  strengthBar.style.backgroundColor =
    strengthPercent >= 84 ? "var(--success)" : strengthPercent >= 50 ? "var(--warning)" : "var(--danger)";
}

function setFieldHelp(elementId, message, tone = "") {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = tone ? `field-help ${tone}` : "field-help";
}

function setFieldState(input, helpId, message, tone = "") {
  setFieldHelp(helpId, message, tone);
  if (!input) {
    return;
  }

  input.classList.toggle("invalid", tone === "error");
  input.classList.toggle("valid", tone === "success");
}

function setButtonBusy(button, isBusy, busyLabel) {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent || "";
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : button.dataset.defaultLabel;
}

function handleFatalError(error) {
  console.error(error);

  const statusElement = document.querySelector(".status-banner");
  if (statusElement) {
    statusElement.textContent = "Could not load data from the server.";
    statusElement.className = "status-banner error";
  }
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

async function loadSession(forceRefresh = false) {
  if (!forceRefresh && sessionCache !== undefined) {
    return sessionCache;
  }

  const response = await fetch("/api/session", {
    credentials: "same-origin"
  });
  const payload = await response.json();

  sessionCache = payload.authenticated ? payload.user : null;
  return sessionCache;
}

function getSelectedSubject() {
  return window.localStorage.getItem(SUBJECT_KEY);
}

function setSelectedSubject(subjectId) {
  window.localStorage.setItem(SUBJECT_KEY, subjectId);
}

function hydrateSession(session) {
  document.querySelectorAll("[data-session-name]").forEach((element) => {
    element.textContent = session.displayName;
  });

  document.querySelectorAll("[data-session-username]").forEach((element) => {
    element.textContent = session.username;
  });

  document.querySelectorAll("[data-session-role]").forEach((element) => {
    element.textContent = session.role;
  });

  document.querySelectorAll("[data-session-avatar]").forEach((element) => {
    const letters = session.displayName
      .split(" ")
      .map((part) => part[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase();

    element.textContent = letters || "JD";
  });
}

function mountSideNavigation(role) {
  const linksByRole = {
    student: [
      ["Dashboard", "/student_dashboard.html", ""],
      ["Subjects", "/subject.html", ""],
      ["Quiz", "/quiz.html", ""],
      ["Progress", "/progress.html", ""],
      ["Homework", "/homework_upload.html", ""]
    ],
    teacher: [
      ["Dashboard", "/teacherdash.html", "dashboard"],
      ["Content", "#content-editor", "content"],
      ["Students", "#teacher-students", "students"],
      ["Schedules", "#teacher-schedules", "schedules"]
    ],
    admin: [
      ["Dashboard", "/admindash.html", "dashboard"],
      ["Accounts", "#accounts", "accounts"],
      ["Content", "#content-editor", "content"],
      ["Reports", "#reports", "reports"],
      ["Review", "/adminrev.html", ""]
    ],
    system_admin: [
      ["Dashboard", "/sysadmindash.html", "dashboard"],
      ["Users", "#system-users", "users"],
      ["Backups", "#system-backups", "backups"],
      ["Permissions", "#system-permissions", "permissions"],
      ["Audit", "#system-audit", "audit"]
    ]
  };
  const links = linksByRole[role] || linksByRole.student;
  if (document.querySelector(".side-nav")) {
    return;
  }

  const currentPath = window.location.pathname;
  const nav = document.createElement("nav");
  nav.className = "side-nav";
  nav.setAttribute("aria-label", "Primary");
  nav.innerHTML = `
    <div class="side-nav-brand">JiruEdu</div>
    ${links
      .map(([label, href, view]) => {
        const isActive = href.startsWith("#") ? false : currentPath.endsWith(href);
        return `<a class="side-nav-link ${isActive ? "active" : ""}" href="${escapeAttribute(href)}" ${
          view ? `data-dashboard-view="${escapeAttribute(view)}"` : ""
        }>${escapeHtml(label)}</a>`;
      })
      .join("")}
  `;
  document.body.prepend(nav);
  initializeDashboardViewNavigation(role);
}

function initializeDashboardViewNavigation(role) {
  const viewGroups = getDashboardViewGroups(role);
  if (!viewGroups) {
    return;
  }

  const availableViewGroups = Object.entries(viewGroups).reduce((groups, [viewName, selectors]) => {
    const elements = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    if (elements.length > 0) {
      groups[viewName] = elements;
    }
    return groups;
  }, {});

  const viewNames = Object.keys(availableViewGroups);
  if (viewNames.length === 0) {
    return;
  }

  const showView = (viewName) => {
    const nextView = availableViewGroups[viewName] ? viewName : "dashboard";
    Object.entries(availableViewGroups).forEach(([groupName, elements]) => {
      elements.forEach((element) => {
        element.classList.toggle("dashboard-view-hidden", groupName !== nextView);
      });
    });

    document.querySelectorAll("[data-dashboard-view]").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("data-dashboard-view") === nextView);
    });

    if (window.location.hash !== `#${nextView}`) {
      window.history.replaceState(null, "", `${window.location.pathname}#${nextView}`);
    }
  };

  document.querySelectorAll("[data-dashboard-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const viewName = link.getAttribute("data-dashboard-view");
      if (!viewName || !availableViewGroups[viewName]) {
        return;
      }

      event.preventDefault();
      showView(viewName);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  const initialView = window.location.hash.slice(1);
  showView(availableViewGroups[initialView] ? initialView : "dashboard");
}

function getDashboardViewGroups(role) {
  if (role === "admin") {
    return {
      dashboard: [
        ".welcome-section",
        ".dashboard-content > .stat-grid",
        "#admin-dashboard-status"
      ],
      accounts: ["#accounts", "#school-directory"],
      content: ["#create-subject", "#content-editor"],
      reports: ["#reports", "#admin-ai-analytics"]
    };
  }

  if (role === "teacher") {
    return {
      dashboard: [".welcome-section", ".dashboard-content > .stat-grid", "#teacher-ai-analytics"],
      students: ["#teacher-students", "#teacher-support", "#teacher-performance"],
      content: ["#content-editor"],
      schedules: ["#teacher-schedules"]
    };
  }

  if (role === "system_admin") {
    return {
      dashboard: [".welcome-section", ".dashboard-content > .stat-grid", "#system-dashboard-status"],
      users: ["#system-users"],
      backups: ["#system-backups"],
      permissions: ["#system-permissions"],
      audit: ["#system-audit"]
    };
  }

  return null;
}

function setText(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = value;
  }
}

function setInputValue(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) {
    element.value = value;
  }
}

function setStatus(elementId, message, tone) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = `status-banner ${tone}`;
}

function clearStatus(elementId) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.textContent = "";
  element.className = "status-banner";
}

function renderGradeLevelOptions(elementId, gradeLevels) {
  const select = document.getElementById(elementId);
  if (!select) {
    return;
  }

  const currentValue = select.value;
  select.innerHTML = `
    <option value="">Select grade level</option>
    ${gradeLevels
      .map(
        (gradeLevel) => `
          <option value="${escapeAttribute(gradeLevel)}">${escapeHtml(gradeLevel)}</option>
        `
      )
      .join("")}
  `;

  if (currentValue && gradeLevels.includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderSubjectCheckboxGroup(containerId, subjects, selectedValues = []) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  const selectedSet = new Set(selectedValues);
  container.innerHTML = subjects
    .map(
      (subject) => `
        <label class="checkbox-card">
          <input type="checkbox" value="${escapeAttribute(subject.id)}" ${
            selectedSet.has(subject.id) ? "checked" : ""
          }>
          <span>
            <strong>${escapeHtml(subject.name)}</strong>
            <small>${escapeHtml(subject.gradeLevel || "")}</small>
          </span>
        </label>
      `
    )
    .join("");
}

function filterSubjectsByGradeLevel(subjects, gradeLevel) {
  if (!gradeLevel) {
    return subjects;
  }

  return subjects.filter((subject) => {
    const subjectGradeLevel = String(subject.gradeLevel || "").trim();
    return !subjectGradeLevel || subjectGradeLevel === "General" || subjectGradeLevel === gradeLevel;
  });
}

async function refreshAdminCatalogDependentInputs() {
  const catalog = await loadPublicCatalog(true);
  renderGradeLevelOptions("admin-user-grade", catalog.gradeLevels);
  renderGradeLevelOptions("admin-new-subject-grade", catalog.gradeLevels);
  renderSubjectCheckboxGroup(
    "admin-user-subjects",
    filterSubjectsByGradeLevel(
      catalog.subjects || [],
      document.getElementById("admin-user-grade")?.value || ""
    ),
    getCheckedValues("admin-user-subjects")
  );
}

function getCheckedValues(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll("input[type='checkbox']:checked"))
    .map((input) => input.value)
    .filter(Boolean);
}

function redirect(location) {
  window.location.href = location;
}

async function apiRequest(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({
    success: false,
    message: "The server returned an invalid response."
  }));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function formatDate(value) {
  if (!value) {
    return "recently";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

function slugifySubjectId(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function debounce(callback, delayMs) {
  let timeoutId = null;

  return (...args) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }

    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, delayMs);
  };
}
