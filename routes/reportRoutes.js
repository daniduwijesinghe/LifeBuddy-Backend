const express = require("express");
const HealthLog = require("../models/HealthLog");
const WeeklyReport = require("../models/WeeklyReport");
const { protect } = require("../middleware/authMiddleware");
const { detectWeeklyPatterns } = require("../services/healthScoreService");

const router = express.Router();

router.post("/weekly", protect, async (req, res) => {
  const weekEnd = new Date();
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const logs = await HealthLog.find({ user: req.user._id, date: { $gte: weekStart, $lte: weekEnd } });

  if (logs.length === 0) {
    return res.status(400).json({ message: "No health logs found for this week" });
  }

  const average = (field) => logs.reduce((sum, log) => sum + Number(log[field] || 0), 0) / logs.length;
  const moodCounts = logs.reduce((acc, log) => {
    acc[log.mood] = (acc[log.mood] || 0) + 1;
    return acc;
  }, {});
  const moodPattern = Object.keys(moodCounts).sort((a, b) => moodCounts[b] - moodCounts[a])[0] || "normal";
  const patterns = detectWeeklyPatterns(logs);

  const report = await WeeklyReport.create({
    user: req.user._id,
    weekStart,
    weekEnd,
    averageScore: Math.round(average("score")),
    waterAverage: Number(average("waterLiters").toFixed(1)),
    medicineMissedCount: logs.filter((log) => log.medicineStatus === "missed").length,
    oilyFoodCount: logs.reduce((sum, log) => sum + log.oilyFoodCount, 0),
    alcoholCount: logs.filter((log) => log.alcoholUsed).length,
    sleepAverage: Number(average("sleepHours").toFixed(1)),
    exerciseTotal: logs.reduce((sum, log) => sum + log.exerciseMinutes, 0),
    moodPattern,
    summary: patterns.join(" ")
  });

  res.status(201).json(report);
});

router.get("/weekly", protect, async (req, res) => {
  const reports = await WeeklyReport.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(reports);
});

module.exports = router;
