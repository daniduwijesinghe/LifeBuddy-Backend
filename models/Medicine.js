const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    time: { type: String, required: true },
    repeatDays: [{ type: String }],
    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active"
    },
    lastAction: {
      type: String,
      enum: ["taken", "missed", "skipped", "none"],
      default: "none"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Medicine", medicineSchema);
