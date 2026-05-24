const express = require("express");
const HealthLog = require("../models/HealthLog");
const Notification = require("../models/Notification");
const { protect, requireActiveSubscription } = require("../middleware/authMiddleware");
const { calculateHealthScore, detectWeeklyPatterns } = require("../services/healthScoreService");
const { predictHealth } = require("../utils/mlService");

const router = express.Router();

router.use(protect, requireActiveSubscription);

router.post("/", protect, async (req, res) => {
  try {
    const requiredMeals = req.body.meals || {};
    const alcoholLevel = Number(req.body.alcoholLevel || 0);

    if (!requiredMeals.breakfast || !requiredMeals.lunch || !requiredMeals.dinner) {
      return res.status(400).json({ message: "Breakfast, lunch, and dinner are required." });
    }

    if (Number(req.body.waterLiters) <= 0) {
      return res.status(400).json({ message: "Water liters must be greater than 0." });
    }

    if (alcoholLevel < 0 || alcoholLevel > 10) {
      return res.status(400).json({ message: "Alcohol level must be from 0 to 10." });
    }

    const result = calculateHealthScore(req.body);

    const log = await HealthLog.create({
      ...req.body,
      user: req.user._id,
      score: result.score,
      status: result.status,
      recommendations: result.recommendations,
      warnings: result.warnings
    });

    try {
      const mlResult = await predictHealth(log, req.user);
      log.aiPrediction = {
        wellnessStatus: mlResult.wellnessStatus,
        wellnessConfidence: mlResult.wellnessConfidence,
        recommendationCategory: mlResult.recommendationCategory,
        recommendationConfidence: mlResult.recommendationConfidence,
        bmi: mlResult.bmi,
        advice: mlResult.advice
      };
      await log.save();
    } catch (mlError) {
      log.aiPrediction = {
        error: "ML service unavailable. Rule-based LifeBuddy advice was saved."
      };
      await log.save();
    }

    await Notification.create({
      user: req.user._id,
      title: "Daily tracker saved",
      message: `Your Life Health Score is ${result.score}% (${result.status}).`,
      type: result.warnings.length ? "alcohol" : "report"
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

router.get("/summary", protect, async (req, res) => {
  const logs = await HealthLog.find({ user: req.user._id }).sort({ date: -1 }).limit(30);
  const total = logs.length || 1;
  const averageScore = Math.round(logs.reduce((sum, log) => sum + log.score, 0) / total);
  const riskyDays = logs.filter((log) => log.status === "Risky").length;
  const alcoholDays = logs.filter((log) => log.alcoholUsed).length;
  const missedMedicine = logs.filter((log) => log.medicineStatus === "missed").length;
  const exerciseTotal = logs.reduce((sum, log) => sum + log.exerciseMinutes, 0);
  const points = logs.reduce((sum, log) => sum + Math.max(10, log.score), 0);

  res.json({
    averageScore: logs.length ? averageScore : 0,
    riskyDays,
    alcoholDays,
    missedMedicine,
    exerciseTotal,
    points,
    totalLogs: logs.length,
    latestLogs: logs.slice(0, 5)
  });
});

module.exports = router;
