const calculateHealthScore = (log) => {
  let score = 50;
  const recommendations = [];
  const warnings = [];

  if (log.waterLiters >= 2) score += 10;
  else recommendations.push("Drink more water today. Try to reach at least 2 liters.");

  if (log.sleepHours >= 7) score += 10;
  else if (log.sleepHours < 6) {
    score -= 10;
    recommendations.push("Your sleep is low. Try to sleep earlier and reduce screen time at night.");
  }

  if (log.exerciseMinutes >= 30) score += 15;
  else recommendations.push("Do at least 30 minutes of walking or exercise.");

  if (log.medicineStatus === "taken") score += 10;
  if (log.medicineStatus === "missed") {
    score -= 20;
    warnings.push("You missed medicine today. Please follow your medicine schedule.");
  }

  if (log.oilyFoodCount >= 3) {
    score -= 10;
    recommendations.push("Reduce oily or fried food.");
  }

  if (log.softDrinkCount >= 2) {
    score -= 5;
    recommendations.push("Reduce soft drinks and choose water more often.");
  }

  if (log.alcoholUsed) {
    score -= 15;
    warnings.push("You recorded alcohol today. Please do not drive.");
    warnings.push("Use a taxi, call a trusted person, or rest before travelling.");
  }

  if (log.stressLevel >= 7 || ["stressed", "anxious", "sad"].includes(log.mood)) {
    score -= 10;
    recommendations.push("You seem mentally tired. Try deep breathing for 5 minutes or talk with someone you trust.");
  }

  score = Math.max(0, Math.min(100, score));

  let status = "Risky";
  if (score >= 80) status = "Good";
  else if (score >= 50) status = "Medium";

  if (recommendations.length === 0) {
    recommendations.push("Great work. Keep following your healthy routine.");
  }

  return { score, status, recommendations, warnings };
};

const detectWeeklyPatterns = (logs) => {
  const messages = [];
  const lowSleepDays = logs.filter((log) => log.sleepHours < 6).length;
  const oilyTotal = logs.reduce((sum, log) => sum + log.oilyFoodCount, 0);
  const alcoholCount = logs.filter((log) => log.alcoholUsed).length;
  const missedMedicine = logs.filter((log) => log.medicineStatus === "missed").length;
  const lowWaterDays = logs.filter((log) => log.waterLiters < 2).length;

  if (lowSleepDays >= 4) messages.push("Your sleep pattern is unhealthy this week. Try to sleep earlier.");
  if (oilyTotal >= 5) messages.push("You ate oily food many times this week. Please reduce fried food.");
  if (alcoholCount > 0) messages.push("Alcohol was recorded this week. Do not drive after drinking.");
  if (missedMedicine > 0) messages.push("You missed medicine this week. Use reminders to stay on schedule.");
  if (lowWaterDays >= 4) messages.push("Your water intake was low on many days. Keep a bottle near you.");

  if (messages.length === 0) messages.push("Your weekly pattern looks stable. Keep improving step by step.");
  return messages;
};

module.exports = { calculateHealthScore, detectWeeklyPatterns };
