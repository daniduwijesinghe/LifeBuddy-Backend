const express = require("express");
const Medicine = require("../models/Medicine");
const Notification = require("../models/Notification");
const { protect, requireActiveSubscription } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect, requireActiveSubscription);

router.post("/", protect, async (req, res) => {
  try {
    const medicine = await Medicine.create({ ...req.body, user: req.user._id });
    await Notification.create({
      user: req.user._id,
      title: "Medicine reminder added",
      message: `Reminder set for ${medicine.name} at ${medicine.time}.`,
      type: "medicine"
    });
    res.status(201).json(medicine);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/", protect, async (req, res) => {
  const medicines = await Medicine.find({ user: req.user._id }).sort({ time: 1 });
  res.json(medicines);
});

router.patch("/:id/action", protect, async (req, res) => {
  const { action } = req.body;
  const medicine = await Medicine.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { lastAction: action },
    { new: true }
  );

  if (!medicine) return res.status(404).json({ message: "Medicine not found" });
  res.json(medicine);
});

router.delete("/:id", protect, async (req, res) => {
  const medicine = await Medicine.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!medicine) return res.status(404).json({ message: "Medicine not found" });
  res.json({ message: "Medicine deleted" });
});

module.exports = router;
