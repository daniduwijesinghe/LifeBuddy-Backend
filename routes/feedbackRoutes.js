const express = require("express");
const Feedback = require("../models/Feedback");
const Notification = require("../models/Notification");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", protect, async (req, res) => {
  try {
    const { category = "app", rating = 5, message } = req.body;

    if (!message || message.trim().length < 5) {
      return res.status(400).json({ message: "Feedback message must be at least 5 characters." });
    }

    const feedback = await Feedback.create({
      user: req.user._id,
      category,
      rating,
      message
    });

    await Notification.create({
      user: req.user._id,
      title: "Feedback submitted",
      message: "Thank you. Your feedback was sent to the admin team.",
      type: "report"
    });

    res.status(201).json(feedback);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/mine", protect, async (req, res) => {
  const feedback = await Feedback.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(feedback);
});

module.exports = router;
