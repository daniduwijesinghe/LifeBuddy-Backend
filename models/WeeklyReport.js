const mongoose = require("mongoose");

const weeklyReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    weekStart: Date,
    weekEnd: Date,
    averageScore: Number,
    waterAverage: Number,
    medicineMissedCount: Number,
    oilyFoodCount: Number,
    alcoholCount: Number,
    sleepAverage: Number,
    exerciseTotal: Number,
    moodPattern: String,
    summary: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("WeeklyReport", weeklyReportSchema);
