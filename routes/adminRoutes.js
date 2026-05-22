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

  res.json({
    users,
    healthLogs,
    medicines,
    payments,
    reports,
    notifications,
    feedback,
    riskyLogs,
    alcoholLogs,
    revenue
  });
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

router.get("/payments", async (req, res) => {
  const payments = await Payment.find().sort({ paymentDate: -1 });
  res.json(payments);
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
  const notifications = await Notification.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(notifications);
});

router.get("/feedback", async (req, res) => {
  const feedback = await Feedback.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .limit(100);
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
