const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: {
      type: String,
      enum: ["app", "health", "medicine", "payment", "safety", "other"],
      default: "app"
    },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    message: { type: String, required: true },
    status: {
      type: String,
      enum: ["new", "reviewed", "resolved"],
      default: "new"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
