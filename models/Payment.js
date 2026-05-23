const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true, lowercase: true, trim: true },
    plan: {
      type: String,
      enum: ["Premium", "Family"],
      default: "Premium"
    },
    amount: { type: Number, default: 700 },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Failed"],
      default: "Pending"
    },
    paymentDate: { type: Date, default: Date.now },
    expiryDate: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    gateway: { type: String, default: "PayHere" },
    gatewayOrderId: String,
    gatewayPaymentId: String,
    gatewayMethod: String,
    cardBrand: String,
    maskedCard: String,
    cardExpiry: String,
    saveCardPreference: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
