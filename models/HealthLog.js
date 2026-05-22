const mongoose = require("mongoose");

const healthLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, default: Date.now },
    food: { type: String, default: "" },
    waterLiters: { type: Number, default: 0 },
    sleepHours: { type: Number, default: 0 },
    exerciseMinutes: { type: Number, default: 0 },
    medicineStatus: {
      type: String,
      enum: ["taken", "missed", "skipped", "none"],
      default: "none"
    },
    mood: {
      type: String,
      enum: ["happy", "normal", "sad", "stressed", "anxious", "tired"],
      default: "normal"
    },
    stressLevel: { type: Number, min: 0, max: 10, default: 0 },
    alcoholUsed: { type: Boolean, default: false },
    softDrinkCount: { type: Number, default: 0 },
    oilyFoodCount: { type: Number, default: 0 },
    score: { type: Number, default: 0 },
    status: { type: String, enum: ["Good", "Medium", "Risky"], default: "Medium" },
    recommendations: [String],
    warnings: [String]
  },
  { timestamps: true }
);

module.exports = mongoose.model("HealthLog", healthLogSchema);
