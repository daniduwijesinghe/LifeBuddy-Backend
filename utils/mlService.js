const axios = require("axios");

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
  });

  return response.data;
}

module.exports = { predictHealth };
