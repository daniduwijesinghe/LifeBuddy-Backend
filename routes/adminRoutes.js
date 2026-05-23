const express = require("express");
const User = require("../models/User");
const HealthLog = require("../models/HealthLog");
const Medicine = require("../models/Medicine");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const Feedback = require("../models/Feedback");
const WeeklyReport = require("../models/WeeklyReport");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

const isValidEmail = (email = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isStrongPassword = (password = "") => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password);
const allowedRoles = ["user", "admin"];
const allowedGenders = ["male", "female", "other"];

const sanitizeUser = (user) => {
  const clean = user.toObject ? user.toObject() : user;
  delete clean.password;
  delete clean.resetCode;
  delete clean.resetCodeExpires;
  delete clean.emailVerificationCode;
  delete clean.emailVerificationExpires;
  return clean;
};

const normalizeNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

const buildUserPayload = (body, isCreate = false) => {
  const payload = {};
  const stringFields = ["name", "healthGoal", "emergencyContact"];

  stringFields.forEach((field) => {
    if (body[field] !== undefined) payload[field] = String(body[field]).trim();
  });

  if (body.email !== undefined) payload.email = String(body.email).trim().toLowerCase();
  if (body.gender !== undefined) payload.gender = body.gender;
  if (body.role !== undefined) payload.role = body.role;

  ["age", "height", "weight"].forEach((field) => {
    const number = normalizeNumber(body[field]);
    if (number !== undefined) payload[field] = number;
  });

  if (body.dailyTargets) {
    payload.dailyTargets = {};
    ["waterLiters", "sleepHours", "exerciseMinutes"].forEach((field) => {
      const number = normalizeNumber(body.dailyTargets[field]);
      if (number !== undefined) payload.dailyTargets[field] = number;
    });
  }

  if (body.password) payload.password = body.password;

  if (isCreate && !payload.name) throw new Error("Name is required.");
  if (payload.email !== undefined && !isValidEmail(payload.email)) throw new Error("Enter a valid email address.");
  if (payload.password !== undefined && !isStrongPassword(payload.password)) {
    throw new Error("Password must be 8+ characters with uppercase, lowercase, number, and symbol.");
  }
  if (payload.gender !== undefined && !allowedGenders.includes(payload.gender)) throw new Error("Invalid gender selected.");
  if (payload.role !== undefined && !allowedRoles.includes(payload.role)) throw new Error("Invalid role selected.");

  return payload;
};

router.use(protect, adminOnly);

router.get("/summary", async (req, res) => {
  const [users, healthLogs, medicines, payments, reports, notifications, feedback, paidPayments, riskyLogs, alcoholLogs] = await Promise.all([
    User.countDocuments({ role: "user" }),
    HealthLog.countDocuments(),
    Medicine.countDocuments(),
    Payment.countDocuments(),
    WeeklyReport.countDocuments(),
    Notification.countDocuments(),
    Feedback.countDocuments(),
    Payment.find({ paymentStatus: "Paid" }),
    HealthLog.countDocuments({ status: "Risky" }),
    HealthLog.countDocuments({ alcoholUsed: true })
  ]);

  const revenue = paidPayments.reduce((sum, payment) => sum + payment.amount, 0);

  res.json({ users, healthLogs, medicines, payments, reports, notifications, feedback, riskyLogs, alcoholLogs, revenue });
});

router.get("/users", async (req, res) => {
  const users = await User.find().select("-password -resetCode").sort({ createdAt: -1 });
  const enriched = await Promise.all(users.map(async (user) => {
    const [latestLog, logCount, payment, medicineCount] = await Promise.all([
      HealthLog.findOne({ user: user._id }).sort({ createdAt: -1 }),
      HealthLog.countDocuments({ user: user._id }),
      Payment.findOne({ userEmail: user.email, paymentStatus: "Paid", expiryDate: { $gte: new Date() } }).sort({ expiryDate: -1 }),
      Medicine.countDocuments({ user: user._id })
    ]);

    return {
      ...user.toObject(),
      logCount,
      medicineCount,
      premiumActive: Boolean(payment),
      latestScore: latestLog?.score || 0,
      latestStatus: latestLog?.status || "No logs",
      latestAlcohol: Boolean(latestLog?.alcoholUsed)
    };
  }));

  res.json(enriched);
});

router.post("/users", async (req, res) => {
  try {
    const payload = buildUserPayload(req.body, true);
    if (!payload.email) return res.status(400).json({ message: "Email is required." });
    if (!payload.password) return res.status(400).json({ message: "Password is required." });

    const exists = await User.findOne({ email: payload.email });
    if (exists) return res.status(400).json({ message: "Email already registered." });

    const user = await User.create({ ...payload, emailVerified: true });
    res.status(201).json({ user: sanitizeUser(user), message: "User account created successfully." });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const payload = buildUserPayload(req.body);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    if (payload.email && payload.email !== user.email) {
      const exists = await User.findOne({ email: payload.email, _id: { $ne: user._id } });
      if (exists) return res.status(400).json({ message: "Email already used by another account." });
    }

    Object.entries(payload).forEach(([key, value]) => {
      if (key === "dailyTargets") {
        user.dailyTargets = { ...user.dailyTargets.toObject?.() || user.dailyTargets, ...value };
      } else {
        user[key] = value;
      }
    });

    await user.save();
    res.json({ user: sanitizeUser(user), message: "User account updated successfully." });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: "You cannot delete your own admin account." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    await Promise.all([
      HealthLog.deleteMany({ user: user._id }),
      Medicine.deleteMany({ user: user._id }),
      Notification.deleteMany({ user: user._id }),
      Feedback.deleteMany({ user: user._id }),
      WeeklyReport.deleteMany({ user: user._id })
    ]);
    await Payment.deleteMany({ userEmail: user.email });
    await user.deleteOne();

    res.json({ message: "User and related records deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/income-report", async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const [monthlyPaid, statusTotals, recentPayments] = await Promise.all([
    Payment.aggregate([
      { $match: { paymentDate: { $gte: start, $lt: end }, paymentStatus: "Paid" } },
      { $group: { _id: { month: { $month: "$paymentDate" } }, income: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { "_id.month": 1 } }
    ]),
    Payment.aggregate([
      { $match: { paymentDate: { $gte: start, $lt: end } } },
      { $group: { _id: "$paymentStatus", amount: { $sum: "$amount" }, count: { $sum: 1 } } }
    ]),
    Payment.find({ paymentDate: { $gte: start, $lt: end } }).sort({ paymentDate: -1 }).limit(20)
  ]);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const months = monthNames.map((name, index) => {
    const found = monthlyPaid.find((item) => item._id.month === index + 1);
    return { month: name, income: found?.income || 0, count: found?.count || 0 };
  });

  const totalIncome = months.reduce((sum, item) => sum + item.income, 0);
  const currentMonth = new Date().getFullYear() === year ? months[new Date().getMonth()] : null;

  res.json({ year, totalIncome, currentMonthIncome: currentMonth?.income || 0, months, statusTotals, recentPayments });
});

router.get("/platform-report", async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [scoreStats, riskyLogs, alcoholLogs, missedMedicines, openFeedback, users, logsLast30, paymentsLast30] = await Promise.all([
    HealthLog.aggregate([{ $group: { _id: null, averageScore: { $avg: "$score" }, bestScore: { $max: "$score" }, lowestScore: { $min: "$score" } } }]),
    HealthLog.countDocuments({ status: "Risky" }),
    HealthLog.countDocuments({ alcoholUsed: true }),
    Medicine.countDocuments({ status: "Missed" }),
    Feedback.countDocuments({ status: { $ne: "resolved" } }),
    User.countDocuments({ role: "user" }),
    HealthLog.countDocuments({ createdAt: { $gte: since } }),
    Payment.countDocuments({ paymentStatus: "Paid", paymentDate: { $gte: since } })
  ]);

  const recentRiskUsers = await HealthLog.find({ $or: [{ status: "Risky" }, { alcoholUsed: true }] })
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    averageScore: Math.round(scoreStats[0]?.averageScore || 0),
    bestScore: scoreStats[0]?.bestScore || 0,
    lowestScore: scoreStats[0]?.lowestScore || 0,
    riskyLogs,
    alcoholLogs,
    missedMedicines,
    openFeedback,
    users,
    logsLast30,
    paymentsLast30,
    recentRiskUsers
  });
});

router.get("/payments", async (req, res) => {
  const baseUrl = (process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const payments = await Payment.find().sort({ paymentDate: -1 });
  res.json(payments.map((payment) => {
    const item = payment.toObject();
    if (item.slip?.fileName) item.slipUrl = `${baseUrl}/api/payments/slip/${item._id}`;
    return item;
  }));
});

router.get("/health-logs", async (req, res) => {
  const logs = await HealthLog.find().populate("user", "name email").sort({ createdAt: -1 }).limit(100);
  res.json(logs);
});

router.get("/reports", async (req, res) => {
  const reports = await WeeklyReport.find().populate("user", "name email").sort({ createdAt: -1 }).limit(100);
  res.json(reports);
});

router.get("/notifications", async (req, res) => {
  const notifications = await Notification.find().populate("user", "name email").sort({ createdAt: -1 }).limit(100);
  res.json(notifications);
});

router.get("/feedback", async (req, res) => {
  const feedback = await Feedback.find().populate("user", "name email").sort({ createdAt: -1 }).limit(100);
  res.json(feedback);
});

router.patch("/feedback/:id/status", async (req, res) => {
  const feedback = await Feedback.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status || "reviewed" },
    { new: true }
  ).populate("user", "name email");

  if (!feedback) return res.status(404).json({ message: "Feedback not found" });
  res.json(feedback);
});

module.exports = router;


