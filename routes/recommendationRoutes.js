const express = require("express");
const HealthLog = require("../models/HealthLog");
const { protect, requireActiveSubscription } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requireActiveSubscription);

const avg = (items, field) => {
  if (!items.length) return 0;
  return Number((items.reduce((sum, item) => sum + Number(item[field] || 0), 0) / items.length).toFixed(1));
};

const count = (items, predicate) => items.filter(predicate).length;

const severityRank = { urgent: 4, high: 3, medium: 2, low: 1 };

const addRecommendation = (list, item) => {
  list.push({
    id: item.id,
    category: item.category,
    severity: item.severity || "medium",
    title: item.title,
    message: item.message,
    actionSteps: item.actionSteps || [],
    reason: item.reason || "Based on your recent LifeBuddy health logs."
  });
};

router.get("/advanced", protect, async (req, res) => {
  try {
    const logs = await HealthLog.find({ user: req.user._id }).sort({ date: -1 }).limit(30);
    const week = logs.slice(0, 7);
    const recommendations = [];

    if (!logs.length) {
      return res.json({
        profile: {
          totalLogs: 0,
          averageScore: 0,
          averageSleep: 0,
          averageWater: 0,
          averageStress: 0,
          alcoholDays: 0,
          missedMedicineDays: 0
        },
        recommendations: [{
          id: "start-tracking",
          category: "Getting started",
          severity: "low",
          title: "Start your first wellness log",
          message: "Add today's meals, water, sleep, exercise, medicine, mood, and safety details to unlock personal AI recommendations.",
          actionSteps: ["Open Daily Habits", "Complete all required fields", "Return here for your personal plan"],
          reason: "No tracker data is available yet."
        }]
      });
    }

    const latest = logs[0];
    const lowSleepDays = count(week, (log) => Number(log.sleepHours || 0) < 6);
    const lowWaterDays = count(week, (log) => Number(log.waterLiters || 0) < 2);
    const noExerciseDays = count(week, (log) => Number(log.exerciseMinutes || 0) < 20);
    const highStressDays = count(week, (log) => Number(log.stressLevel || 0) >= 7 || ["stressed", "anxious"].includes(log.mood));
    const alcoholDays = count(week, (log) => log.alcoholUsed || Number(log.alcoholLevel || 0) > 0);
    const highAlcoholDays = count(week, (log) => Number(log.alcoholLevel || 0) >= 5);
    const missedMedicineDays = count(week, (log) => log.medicineStatus === "missed");
    const oilyFoodDays = count(week, (log) => Number(log.oilyFoodCount || 0) >= 2);
    const softDrinkDays = count(week, (log) => Number(log.softDrinkCount || 0) >= 2);
    const riskyDays = count(week, (log) => log.status === "Risky" || Number(log.score || 0) < 50);
    const tiredMoodDays = count(week, (log) => ["tired", "sad"].includes(log.mood));

    if (latest.alcoholUsed || Number(latest.alcoholLevel || 0) > 0) {
      addRecommendation(recommendations, {
        id: "alcohol-safety-today",
        category: "Safety",
        severity: "urgent",
        title: "Do not drive today",
        message: "You recorded alcohol in your latest log. Your safety level is lower today, so avoid driving, operating machines, or travelling alone.",
        actionSteps: ["Use a taxi or rideshare", "Call a trusted person", "Rest before travelling", "Drink water and eat a light meal"],
        reason: "Latest tracker log includes alcohol use."
      });
    }

    if (lowSleepDays >= 4) {
      addRecommendation(recommendations, {
        id: "sleep-pattern-risk",
        category: "Sleep",
        severity: "high",
        title: "Unhealthy sleep pattern detected",
        message: `You slept less than 6 hours on ${lowSleepDays} days this week. This can affect mood, focus, cravings, and energy.`,
        actionSteps: ["Sleep 30 minutes earlier tonight", "Stop screens 45 minutes before bed", "Avoid caffeine late evening", "Keep the same wake-up time"],
        reason: "Pattern detection found repeated low sleep."
      });
    }

    if (lowWaterDays >= 3) {
      addRecommendation(recommendations, {
        id: "hydration-low",
        category: "Hydration",
        severity: "medium",
        title: "Water intake needs attention",
        message: `Your water intake was below 2L on ${lowWaterDays} recent days. Low hydration can increase tiredness and headaches.`,
        actionSteps: ["Drink one glass after waking", "Keep a bottle near you", "Add water reminder after lunch", "Reduce soft drinks gradually"],
        reason: "Water pattern is below the daily target."
      });
    }

    if (noExerciseDays >= 4) {
      addRecommendation(recommendations, {
        id: "movement-low",
        category: "Exercise",
        severity: "medium",
        title: "Movement routine is low",
        message: `You had less than 20 minutes of exercise on ${noExerciseDays} days this week. Start small and build consistency.`,
        actionSteps: ["Walk 10 minutes after a meal", "Stretch for 5 minutes", "Choose stairs when possible", "Aim for 30 minutes most days"],
        reason: "Exercise minutes are repeatedly below the wellness target."
      });
    }

    if (highStressDays >= 3) {
      addRecommendation(recommendations, {
        id: "stress-high",
        category: "Mental wellness",
        severity: "high",
        title: "Stress pattern detected",
        message: `Your stress or anxious mood appeared on ${highStressDays} days. LifeBuddy recommends a simple calming routine and support from someone you trust.`,
        actionSteps: ["Try 4-4-6 breathing for 3 minutes", "Drink water", "Write the main worry in one sentence", "Talk to a trusted person"],
        reason: "Mood and stress levels show repeated mental load."
      });
    }

    if (missedMedicineDays >= 1) {
      addRecommendation(recommendations, {
        id: "medicine-missed",
        category: "Medicine",
        severity: missedMedicineDays >= 2 ? "high" : "medium",
        title: "Medicine adherence warning",
        message: `You missed medicine on ${missedMedicineDays} recent day(s). Missing medicine can reduce treatment consistency.`,
        actionSteps: ["Set a LifeBuddy medicine alarm", "Keep medicine in a visible safe place", "Mark Taken immediately after taking it", "Ask a family member to remind you if needed"],
        reason: "Medicine status includes missed entries."
      });
    }

    if (highAlcoholDays >= 1 || alcoholDays >= 2) {
      addRecommendation(recommendations, {
        id: "alcohol-weekly-risk",
        category: "Alcohol safety",
        severity: highAlcoholDays ? "high" : "medium",
        title: "Alcohol safety pattern needs control",
        message: "Alcohol entries appeared in your recent logs. Plan safer transport before drinking and avoid risky travel decisions.",
        actionSteps: ["Decide transport before drinking", "Do not drive after drinking", "Avoid travelling alone", "Reduce alcohol frequency gradually"],
        reason: "Weekly logs include alcohol use."
      });
    }

    if (oilyFoodDays >= 3 || softDrinkDays >= 3) {
      addRecommendation(recommendations, {
        id: "food-pattern",
        category: "Food habits",
        severity: "medium",
        title: "Food habit pattern detected",
        message: "Oily foods or soft drinks are appearing often. A small reduction can improve energy and health score.",
        actionSteps: ["Replace one soft drink with water", "Choose grilled or boiled food twice this week", "Add vegetables to lunch", "Keep fried food for planned occasions"],
        reason: "Food pattern detection found repeated oily food or soft drink counts."
      });
    }

    if (riskyDays >= 2) {
      addRecommendation(recommendations, {
        id: "score-risk",
        category: "Health score",
        severity: "high",
        title: "Life Health Score risk trend",
        message: `Your recent logs include ${riskyDays} risky day(s). Focus on the easiest two improvements first: water and sleep.`,
        actionSteps: ["Drink at least 2L water", "Sleep 7 hours tonight", "Do 10 minutes walking", "Take medicine on time"],
        reason: "Health score algorithm detected low score days."
      });
    }

    if (tiredMoodDays >= 3 && lowSleepDays >= 2) {
      addRecommendation(recommendations, {
        id: "mood-sleep-link",
        category: "Mood pattern",
        severity: "medium",
        title: "Mood and sleep may be connected",
        message: "Tired or sad moods appeared together with low sleep. Improving bedtime consistency may help your daily energy.",
        actionSteps: ["Try a fixed sleep time for 3 nights", "Avoid scrolling in bed", "Get morning sunlight", "Use the mental support chatbot if you feel emotionally tired"],
        reason: "Pattern detection linked mood entries with sleep entries."
      });
    }

    if (!recommendations.length) {
      addRecommendation(recommendations, {
        id: "stable-progress",
        category: "Progress",
        severity: "low",
        title: "Your patterns look stable",
        message: "Your recent logs do not show a major risk pattern. Keep your routine steady and continue tracking daily.",
        actionSteps: ["Keep water near 2L", "Maintain 7-9 hours sleep", "Move 30 minutes", "Avoid driving after alcohol"],
        reason: "No repeated high-risk pattern was detected."
      });
    }

    recommendations.sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);

    res.json({
      profile: {
        totalLogs: logs.length,
        averageScore: Math.round(avg(logs, "score")),
        averageSleep: avg(week, "sleepHours"),
        averageWater: avg(week, "waterLiters"),
        averageStress: avg(week, "stressLevel"),
        alcoholDays,
        missedMedicineDays,
        lowSleepDays,
        lowWaterDays,
        noExerciseDays,
        highStressDays
      },
      recommendations
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
