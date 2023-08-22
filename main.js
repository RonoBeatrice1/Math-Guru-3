const express = require("express");
const mysql = require("mysql");
const session = require("express-session");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const saltRounds = 10;

const app = express();
const path = require("path");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

//  MySQL database connection
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "MathGuru",
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
    return;
  }
  console.log("Connected to MySQL database!");
});

app.use(
  session({
    secret: "secret word",
    resave: false,
    saveUninitialized: true,
  })
);

const verifyToken = (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({ message: "Access denied" });
  }

  try {
    const user = jwt.verify(token, "your-secret-key");
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

app.get("/protected-route", verifyToken, (req, res) => {
  // The user is authenticated, proceed with the request
  // ...
});

app.get("/", (req, res) => {
  res.render("index.ejs");
});

app.get("/forms", (req, res) => {
  res.render("forms.ejs");
});

app.get("/register", (req, res) => {
  if (req.session.user) {
    res.redirect("/");
  } else {
    res.render("forms.ejs");
  }
});

app.post("/register", (req, res) => {
  connection.query(
    "SELECT email FROM users WHERE email = ?",
    [req.body.email],
    (selectErr, data) => {
      if (selectErr) {
        console.log("SQL error: " + selectErr);
        res.render("forms.ejs", {
          error: "An error occurred. Please try again later.",
        });
      } else {
        if (data.length > 0) {
          res.render("forms.ejs", { emailError: "Email already exists" });
        } else {
          if (req.body.confirmPassword === req.body.password) {
            const salt = bcrypt.genSaltSync(saltRounds);
            const hashedPassword = bcrypt.hashSync(req.body.password, salt);
            connection.query(
              "INSERT INTO users(username, email, password) VALUES(?, ?, ?)",
              [req.body.username, req.body.email, hashedPassword],
              (err) => {
                if (err) {
                  console.log("SQL error: " + err);
                  res.render("forms.ejs", {
                    error: "An error occurred. Please try again later.",
                  });
                } else {
                  res.redirect("/login");
                }
              }
            );
          } else {
            res.render("forms.ejs", {
              passwordError: "Password and confirm password do not match",
            });
          }
        }
      }
    }
  );
});

app.get("/login", (req, res) => {
  res.render("forms.ejs");
});

app.post("/login", (req, res) => {
  console.log("Login route triggered");

  connection.query(
    "SELECT * FROM users WHERE email = ?",
    [req.body.email],
    (selectErr, data) => {
      if (selectErr) {
        console.log("SQL error: " + selectErr);
        res.render("forms.ejs", {
          error: "An error occurred. Please try again later.",
        });
      } else {
        if (data.length > 0) {
          bcrypt.compare(
            req.body.password,
            data[0].password,
            (compareErr, isPasswordCorrect) => {
              if (compareErr) {
                console.log("Password comparison error:", compareErr);
                res.render("forms.ejs", {
                  error: "An error occurred. Please try again later.",
                });
              } else if (isPasswordCorrect) {
                req.session.isLoggedIn = true;
                req.session.user = data[0];
                console.log("Redirecting to /courses");
                res.redirect("/courses");
                console.log("Redirection executed");
              } else {
                // Password incorrect
                res.render("forms.ejs", {
                  loginError: "Email or Password incorrect",
                });
              }
            }
          );
        } else {
          // User not found
          res.render("forms.ejs", {
            loginError: "Email or Password incorrect",
          });
        }
      }
    }
  );
});

app.get("/courses", (req, res) => {
  if (req.session.isLoggedIn) {
    const query = "SELECT * FROM Courses";
    connection.query(query, (err, result) => {
      if (err) {
        console.error("Error fetching courses:", err);
        return res.status(500).send("Error fetching courses");
      }

      const courses = result;
      console.log("Courses:", courses);

      res.render("courses.ejs", { courses });
    });
  } else {
    res.redirect("/login");
  }
});

// Route to handle course card click and redirect to levels page
app.get("/courses/:courseName", (req, res) => {
  const courseName = req.params.courseName;

  res.redirect(`/courses/${courseName}/levels`);
});

// Route to render the levels page for a specific course
app.get("/courses/:courseName/levels", (req, res) => {
  const courseName = req.params.courseName;

  const courseQuery = "SELECT * FROM Courses WHERE course_name = ?";
  connection.query(courseQuery, [courseName], (err, courseResult) => {
    if (err || courseResult.length === 0) {
      console.error("Error fetching course data:", err);
      return res.status(500).send("Error fetching course data");
    }

    const courseId = courseResult[0].course_id;

    const levelsQuery = "SELECT * FROM Levels WHERE course_id = ?";
    connection.query(levelsQuery, [courseId], (err, levelsResult) => {
      if (err) {
        console.error("Error fetching levels:", err);
        return res.status(500).send("Error fetching levels");
      }

      const levelsData = levelsResult;

      // get scores
      const queryVars = [req.session.user.id, courseResult[0].course_id];
      connection.query(
        "SELECT DISTINCT level_id FROM QuizScores WHERE user_id = ? AND course_id = ?",
        queryVars,
        (queryErr, userLevels) => {
          console.log(userLevels);
          let userLevelsArray = [];
          if (userLevels.length > 0) {
            userLevels.forEach((userLevel) => {
              userLevelsArray.push(userLevel.level_id);
            });
          }
          console.log(userLevelsArray);
          res.render("levels.ejs", {
            courseId,
            courseName,
            levels: levelsData,
            userLevelsArray: userLevelsArray,
          });
        }
      );
    });
  });
});

// Route to handle course card click and redirect to levels page
app.get("/course/:courseId", (req, res) => {
  const courseId = req.params.courseId;

  res.redirect(`/courses/${courseId}/levels`);
});

// Route to render the levels page for a specific course
app.get("/courses/:courseId/levels", (req, res) => {
  const courseId = req.params.courseId;

  const courseQuery = "SELECT course_name FROM Courses WHERE course_id = ?";
  connection.query(courseQuery, [courseId], (err, courseResult) => {
    if (err) {
      console.error("Error fetching course name:", err);
      return res.status(500).send("Error fetching course name");
    }

    const courseName = courseResult[0].course_name;

    const levelsQuery = "SELECT * FROM Levels WHERE course_id = ?";
    connection.query(levelsQuery, [courseId], (err, levelsResult) => {
      if (err) {
        console.error("Error fetching levels:", err);
        return res.status(500).send("Error fetching levels");
      }

      const levelsData = levelsResult;

      console.log("Course Name:", courseName);
      console.log("Levels Data:", levelsData);

      res.render("levels.ejs", { courseId, courseName, levels: levelsData });
    });
  });
});

app.get("/coursesOriginal/:courseId/levels/:levelId/quiz", (req, res) => {
  const courseId = req.params.courseId;
  const levelId = req.params.levelId;

  const quizQuery = `
    SELECT q.question_text, o.option_text
    FROM Questions q
    INNER JOIN Options o ON q.question_id = o.question_id
    WHERE q.course_id = ? AND q.question_text IN (
      SELECT DISTINCT question_text
      FROM Questions
      WHERE course_id = ?
    )
  `;

  connection.query(quizQuery, [courseId, courseId], (err, result) => {
    if (err) {
      console.error("Error fetching quiz data:", err);
      return res.status(500).send("Error fetching quiz data");
    }

    console.log("Fetched result:", result);

    const questions = {};

    result.forEach((row) => {
      if (!questions[row.question_text]) {
        questions[row.question_text] = [];
      }
      questions[row.question_text].push({ option_text: row.option_text });
    });

    console.log("Parsed questions:", questions);

    const courseName = "Calculus";
    const levelName = "Level 1";

    res.render("quiz.ejs", {
      courseName,
      levelName,
      courseId,
      questions: Object.keys(questions).map((key) => ({
        question_text: key,
        options: questions[key],
      })),
    });
  });
});
app.get("/courses/:courseId/levels/:levelId/quiz", (req, res) => {
  const courseId = Number(req.params.courseId);
  const levelId = Number(req.params.levelId);
  connection.query(
    "SELECT * FROM Questions WHERE course_id = ?",
    [courseId],
    (err, questions) => {
      connection.query("SELECT * FROM Options", (err2, options) => {
        connection.query(
          "SELECT * FROM Courses WHERE course_id = ?",
          [courseId],
          (err3, course) => {
            connection.query(
              "SELECT * FROM Levels WHERE level_id = ?",
              [levelId],
              (err4, level) => {
                if (err || err2 || err3 || err4) {
                  res.send("DB QUERY ERR");
                } else {
                  console.log("Course: ", course);
                  console.log("Level: ", level);
                  console.log("Questions: ", questions);
                  console.log("Options", options);
                  res.render("quizTwo.ejs", {
                    course: course[0],
                    level: level[0],
                    questions: questions,
                    options: options,
                  });
                }
              }
            );
          }
        );
      });
    }
  );
});

// Function to fetch correct answers from the database
function getCorrectAnswersFromDB() {
  return new Promise((resolve, reject) => {
    connection.query(
      `
      SELECT question_id, correct_option_id
      FROM Correct_Answers
      `,
      (err, results) => {
        if (err) {
          console.error("Error fetching correct answers:", err);
          reject("Error fetching correct answers");
        } else {
          const correctAnswers = results.reduce((acc, row) => {
            acc[row.question_id] = row.correct_option_id;
            return acc;
          }, {});
          resolve(correctAnswers);
        }
      }
    );
  });
}

// Function to insert the calculated quiz score into the quizScores table
function insertQuizScore(userId, username, courseId, levelId, score) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO QuizScores (user_id, username, course_id, level_id, score)
      VALUES (?, ?, ?, ?, ?)
    `;
    connection.query(
      query,
      [userId, username, courseId, levelId, score],
      (err, result) => {
        if (err) {
          console.error("Error inserting quiz score:", err);
          reject("Error inserting quiz score");
        } else {
          resolve(result);
        }
      }
    );
  });
}

const requireLogin = (req, res, next) => {
  if (req.session.isLoggedIn && req.session.user) {
    next();
  } else {
    res.redirect("/login");
  }
};

// Route to handle quiz submission and calculate/save score
app.post(
  "/submit-quiz-new/:courseId/:levelId",
  requireLogin,
  async (req, res) => {
    try {
      const userId = req.session.user.id;
      const courseId = req.params.courseId;
      const levelId = req.params.levelId;
      const userAnswers = req.body.userAnswers;

      console.log("User Answers:", userAnswers);

      const correctAnswers = await getCorrectAnswersFromDB();

      console.log("Correct Answers:", correctAnswers);
      let correctCount = 0;

      let levelQuestions = Object.keys(userAnswers);
      console.log(levelQuestions);
      levelQuestions.forEach((quest) => {
        if (userAnswers[quest] == correctAnswers[quest]) {
          correctCount++;
        }
      });
      const totalQuestions = Object.keys(userAnswers).length;
      console.log(correctCount);
      console.log(totalQuestions);
      const score = (correctCount / totalQuestions) * 100;

      await insertQuizScore(
        userId,
        req.session.user.username,
        courseId,
        levelId,
        score
      );

      console.log("Score:", score);

      console.log("Quiz submission successful!");

      res.json({ success: true, score });
    } catch (error) {
      console.error("Error submitting quiz:", error);
      res.status(500).json({ error: "Error submitting quiz" });
    }
  }
);

app.get("/logout", (req, res) => {
  // Destroy the session and redirect to the home page
  req.session.destroy((err) => {
    if (err) {
      console.log("Error destroying session:", err);
    }
    res.redirect("/");
  });
});

app.get("/survey", (req, res) => {
  res.render("survey.ejs");
});

// app.get("/calculus", (req, res) => {
//   console.log("Accessed /calculus route");
//   res.render("calculus.ejs");
// });
app.get("/faq", (req, res) => {
  console.log("Accessed /faq route");
  res.render("FAQ.ejs");
});

app.get("/subscription", (req, res) => {
  console.log("Accessed /subscription route");
  res.render("subscription.ejs");
});

app.get("/payment", (req, res) => {
  console.log("Accessed /payment route");
  res.render("payment.ejs");
});

app.get("/quizform", (req, res) => {
  console.log("Accessed the /quizform route");

  res.render("quizform.ejs");
});

const port = 3010;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
