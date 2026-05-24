const axios = require("axios");

const buildLocalPrediction = (log, user) => {
  const water = Number(log.waterLiters || 0);
  const sleep = Number(log.sleepHours || 0);
  const exercise = Number(log.exerciseMinutes || 0);
  const stress = Number(log.stressLevel || 0);
  const alcohol = Number(log.alcoholLevel || 0);
  const oily = Number(log.oilyFoodCount || 0);
  const softDrinks = Number(log.softDrinkCount || 0);
  const height = Number(user.height || 170);
  const weight = Number(user.weight || 70);
  const bmi = weight / ((height / 100) ** 2);

  let recommendationCategory = "balanced";
  if (alcohol > 0) recommendationCategory = "alcohol_safety";
  else if (log.medicineStatus === "missed") recommendationCategory = "medicine";
  else if (sleep < 6) recommendationCategory = "sleep";
  else if (water < 2) recommendationCategory = "hydration";
  else if (stress >= 8) recommendationCategory = "mental_wellness";
  else if (exercise < 20) recommendationCategory = "exercise";
  else if (oily >= 3 || softDrinks >= 3) recommendationCategory = "food";

  const adviceMap = {
    hydration: ["Your water intake is low. Try to drink water regularly throughout the day.", "Keep a bottle near you and target at least 2 liters if suitable for you."],
    sleep: ["Your sleep pattern needs attention. Try sleeping earlier tonight.", "Reduce screen time before bed and keep a fixed sleep time."],
    exercise: ["Your movement level is low. Add at least 20 minutes of walking.", "Small daily exercise is better than doing nothing."],
    medicine: ["Medicine routine needs attention. Keep reminders active.", "If you missed important medicine, follow your doctor's instructions."],
    food: ["Reduce oily food and soft drinks this week.", "Try to add vegetables, fruits, and lighter meals."],
    alcohol_safety: ["You recorded alcohol. Do not drive today.", "Use a taxi, call a trusted person, or rest before travelling."],
    mental_wellness: ["Your stress level looks high. Try slow breathing for 5 minutes.", "Talk with someone you trust if you feel mentally tired."],
    balanced: ["Good progress. Keep your healthy routine steady.", "Continue tracking your daily habits."]
  };

  return {
    wellnessStatus: log.status || "Medium",
    wellnessConfidence: 0.65,
    recommendationCategory,
    recommendationConfidence: 0.65,
    bmi: Number(bmi.toFixed(2)),
    advice: adviceMap[recommendationCategory],
    source: "backup-ai"
  };
};

async function predictHealth(log, user) {
  const url = process.env.ML_API_URL || "http://localhost:8000";

  const response = await axios.post(`${url}/predict`, {
    age: Number(user.age || 25),
    height_cm: Number(user.height || 170),
    weight_kg: Number(user.weight || 70),
    water_liters: Number(log.waterLiters || 0),
    sleep_hours: Number(log.sleepHours || 0),
    exercise_minutes: Number(log.exerciseMinutes || 0),
    stress_level: Number(log.stressLevel || 1),
    alcohol_level: Number(log.alcoholLevel || 0),
    oily_food_count: Number(log.oilyFoodCount || 0),
    soft_drink_count: Number(log.softDrinkCount || 0),
    daily_steps: Number(log.dailySteps || 0),
    medicine_missed: log.medicineStatus === "missed" || log.medicineTaken === false ? 1 : 0
  }, { timeout: 8000 });

  return response.data;
}

module.exports = { predictHealth, buildLocalPrediction };
