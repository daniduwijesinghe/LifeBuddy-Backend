const express = require("express");
const HealthLog = require("../models/HealthLog");
const { protect } = require("../middleware/authMiddleware");
const { calculateHealthScore, detectWeeklyPatterns } = require("../services/healthScoreService");

const router = express.Router();

router.post("/", protect, async (req, res) => {
  try {
    const result = calculateHealthScore(req.body);

    const log = await HealthLog.create({
      ...req.body,
      user: req.user._id,
      score: result.score,
      status: result.status,
      recommendations: result.recommendations,
      warnings: result.warnings
    });

    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", protect, async (req, res) => {
  const logs = await HealthLog.find({ user: req.user._id }).sort({ date: -1 });
  res.json(logs);
});

router.get("/today", protect, async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const log = await HealthLog.findOne({
    user: req.user._id,
    date: { $gte: start, $lte: end }
  }).sort({ createdAt: -1 });

  res.json(log);
});

router.get("/weekly-patterns", protect, async (req, res) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const logs = await HealthLog.find({ user: req.user._id, date: { $gte: weekAgo } });
  res.json({ patterns: detectWeeklyPatterns(logs) });
});

module.exports = router;
