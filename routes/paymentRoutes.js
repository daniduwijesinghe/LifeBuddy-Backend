const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { getSubscriptionStatus } = require("../services/subscriptionService");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG, and PDF payment slips are allowed."));
  }
});

const bankDetails = {
  bankName: process.env.BANK_NAME || "Your Bank Name",
  accountHolder: process.env.BANK_ACCOUNT_HOLDER || "LifeBuddy",
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || "Add bank account number in Render",
  branch: process.env.BANK_BRANCH || "Main Branch"
};

const gatewayBaseUrl = () => process.env.PAYHERE_SANDBOX === "true"
  ? "https://sandbox.payhere.lk/pay/checkout"
  : "https://www.payhere.lk/pay/checkout";

const backendBaseUrl = (req) => (process.env.BACKEND_PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const planAmount = (plan) => plan === "Family" ? 1200 : 700;
const md5 = (value) => crypto.createHash("md5").update(String(value)).digest("hex").toUpperCase();

const paymentHash = ({ merchantId, orderId, amount, currency, merchantSecret }) => {
  const formattedAmount = Number(amount).toFixed(2);
  return md5(`${merchantId}${orderId}${formattedAmount}${currency}${md5(merchantSecret)}`);
};

const statusFromPayHere = (statusCode) => {
  if (String(statusCode) === "2") return "Paid";
  if (["-1", "-2", "-3"].includes(String(statusCode))) return "Failed";
  return "Pending";
};

const publicPayment = (payment, req) => {
  const item = payment.toObject ? payment.toObject() : payment;
  if (item.slip?.data) delete item.slip.data;
  if (item.slip?.fileName) item.slipUrl = `${backendBaseUrl(req)}/api/payments/slip/${item._id}`;
  return item;
};

const activateManualPayment = async (payment, adminEmail, adminNote) => {
  payment.paymentStatus = "Paid";
  payment.paymentDate = new Date();
  payment.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  payment.bankTransfer.verifiedBy = adminEmail;
  payment.bankTransfer.verifiedAt = new Date();
  payment.bankTransfer.adminNote = adminNote || "Manual bank slip verified by admin.";
  await payment.save();

  const user = await User.findOne({ email: payment.userEmail });
  if (user) {
    await Notification.create({
      user: user._id,
      title: "Bank payment verified",
      message: `${payment.plan} plan activated until ${payment.expiryDate.toDateString()}.`,
      type: "report"
    });
  }
};

router.get("/subscription", protect, async (req, res) => {
  const subscription = await getSubscriptionStatus(req.user);
  res.json(subscription);
});

router.get("/bank-details", protect, async (req, res) => {
  res.json({ ...bankDetails, plans: [{ name: "Premium", amount: 700 }, { name: "Family", amount: 1200 }] });
});

router.post("/manual-slip", protect, upload.single("slip"), async (req, res) => {
  try {
    const plan = req.body.plan === "Family" ? "Family" : "Premium";
    const amount = Number(req.body.amount);
    const expectedAmount = planAmount(plan);

    if (!req.file) return res.status(400).json({ message: "Please upload payment slip image or PDF." });
    if (!Number.isFinite(amount) || amount !== expectedAmount) {
      return res.status(400).json({ message: `Amount must be Rs. ${expectedAmount} for ${plan} plan.` });
    }
    if (!String(req.body.transferReference || "").trim()) return res.status(400).json({ message: "Bank reference number is required." });
    if (!req.body.transferDate) return res.status(400).json({ message: "Payment date is required." });

    const payment = await Payment.create({
      userEmail: req.user.email,
      plan,
      amount,
      paymentStatus: "Pending",
      paymentDate: new Date(req.body.transferDate),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      gateway: "Manual Bank Transfer",
      gatewayOrderId: `BANK-${Date.now()}-${String(req.user._id).slice(-6)}`,
      gatewayMethod: "Bank slip upload",
      bankTransfer: {
        bankName: String(req.body.bankName || bankDetails.bankName).trim(),
        accountNumber: String(req.body.accountNumber || bankDetails.accountNumber).trim(),
        accountHolder: bankDetails.accountHolder,
        transferReference: String(req.body.transferReference).trim(),
        transferDate: new Date(req.body.transferDate),
        payerName: String(req.body.payerName || req.user.name || "").trim(),
        userNote: String(req.body.userNote || "").trim()
      },
      slip: {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer.toString("base64"),
        uploadedAt: new Date()
      }
    });

    await Notification.create({
      user: req.user._id,
      title: "Payment slip submitted",
      message: "Your bank payment slip is pending admin verification.",
      type: "report"
    });

    res.status(201).json({ payment: publicPayment(payment, req), message: "Payment slip uploaded. Admin will verify it soon." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/slip/:id", protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id).select("+slip.data");
    if (!payment || !payment.slip?.data) return res.status(404).send("Slip not found");
    if (req.user.role !== "admin" && payment.userEmail !== req.user.email) return res.status(403).send("Not allowed");

    const buffer = Buffer.from(payment.slip.data, "base64");
    res.setHeader("Content-Type", payment.slip.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${payment.slip.fileName || "payment-slip"}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.patch("/manual/:id/verify", protect, adminOnly, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found." });
    if (payment.gateway !== "Manual Bank Transfer") return res.status(400).json({ message: "Only manual bank payments can be verified here." });

    const status = req.body.status === "Paid" ? "Paid" : "Failed";
    if (status === "Paid") {
      await activateManualPayment(payment, req.user.email, req.body.adminNote);
    } else {
      payment.paymentStatus = "Failed";
      payment.bankTransfer.adminNote = req.body.adminNote || "Manual bank slip rejected by admin.";
      payment.bankTransfer.verifiedBy = req.user.email;
      payment.bankTransfer.verifiedAt = new Date();
      await payment.save();

      const user = await User.findOne({ email: payment.userEmail });
      if (user) {
        await Notification.create({
          user: user._id,
          title: "Bank payment rejected",
          message: payment.bankTransfer.adminNote,
          type: "warning"
        });
      }
    }

    res.json({ payment: publicPayment(payment, req), message: `Payment marked as ${status}.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/checkout", protect, async (req, res) => {
  try {
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;

    if (!merchantId || !merchantSecret) {
      return res.status(503).json({
        message: "Payment gateway is not configured yet. Add PAYHERE_MERCHANT_ID and PAYHERE_MERCHANT_SECRET in Render environment variables."
      });
    }

    const plan = req.body.plan === "Family" ? "Family" : "Premium";
    const amount = planAmount(plan);
    const currency = "LKR";
    const orderId = `LB-${Date.now()}-${String(req.user._id).slice(-6)}`;
    const baseUrl = backendBaseUrl(req);

    const payment = await Payment.create({
      userEmail: req.user.email,
      plan,
      amount,
      paymentStatus: "Pending",
      gateway: "PayHere",
      gatewayOrderId: orderId,
      saveCardPreference: Boolean(req.body.saveCardPreference)
    });

    const fields = {
      merchant_id: merchantId,
      return_url: `${baseUrl}/api/payments/payhere/return?order_id=${encodeURIComponent(orderId)}`,
      cancel_url: `${baseUrl}/api/payments/payhere/cancel?order_id=${encodeURIComponent(orderId)}`,
      notify_url: `${baseUrl}/api/payments/payhere/notify`,
      order_id: orderId,
      items: `LifeBuddy ${plan} Plan`,
      amount: amount.toFixed(2),
      currency,
      first_name: req.user.name || "LifeBuddy",
      last_name: "User",
      email: req.user.email,
      phone: req.user.emergencyContact || "0000000000",
      address: "LifeBuddy Mobile App",
      city: "Colombo",
      country: "Sri Lanka",
      custom_1: String(payment._id),
      custom_2: req.body.saveCardPreference ? "save-card-requested" : "one-time",
      hash: paymentHash({ merchantId, orderId, amount, currency, merchantSecret })
    };

    res.status(201).json({
      payment: publicPayment(payment, req),
      checkoutUrl: `${baseUrl}/api/payments/payhere/checkout/${orderId}`,
      gateway: "PayHere",
      acceptedMethods: ["VISA", "MASTER", "AMEX", "GENIE", "FRIMI", "EZCASH", "MCASH"],
      fields
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/payhere/checkout/:orderId", async (req, res) => {
  try {
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const payment = await Payment.findOne({ gatewayOrderId: req.params.orderId });
    if (!payment || !merchantId || !merchantSecret) return res.status(404).send("Payment session not found or gateway not configured.");

    const amount = Number(payment.amount).toFixed(2);
    const currency = "LKR";
    const baseUrl = backendBaseUrl(req);
    const fields = {
      merchant_id: merchantId,
      return_url: `${baseUrl}/api/payments/payhere/return?order_id=${encodeURIComponent(payment.gatewayOrderId)}`,
      cancel_url: `${baseUrl}/api/payments/payhere/cancel?order_id=${encodeURIComponent(payment.gatewayOrderId)}`,
      notify_url: `${baseUrl}/api/payments/payhere/notify`,
      order_id: payment.gatewayOrderId,
      items: `LifeBuddy ${payment.plan} Plan`,
      amount,
      currency,
      first_name: "LifeBuddy",
      last_name: "User",
      email: payment.userEmail,
      phone: "0000000000",
      address: "LifeBuddy Mobile App",
      city: "Colombo",
      country: "Sri Lanka",
      custom_1: String(payment._id),
      custom_2: payment.saveCardPreference ? "save-card-requested" : "one-time",
      hash: paymentHash({ merchantId, orderId: payment.gatewayOrderId, amount, currency, merchantSecret })
    };

    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${key}" value="${String(value).replace(/"/g, "&quot;")}" />`)
      .join("\n");

    res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1" /><title>LifeBuddy Payment</title></head><body style="font-family:Arial;padding:24px;background:#ecfdf5;color:#0f172a"><h2>Opening PayHere...</h2><p>Please wait while LifeBuddy redirects you to the secure payment gateway.</p><form id="payhere" method="post" action="${gatewayBaseUrl()}">${inputs}<button type="submit">Continue to PayHere</button></form><script>document.getElementById('payhere').submit();</script></body></html>`);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.post("/payhere/notify", express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const { order_id, payment_id, status_code, md5sig, method, card_no, card_expiry } = req.body;
    const payment = await Payment.findOne({ gatewayOrderId: order_id });
    if (!payment) return res.status(404).send("Payment not found");

    const localSig = md5(`${process.env.PAYHERE_MERCHANT_ID}${order_id}${payment.amount.toFixed(2)}LKR${status_code}${md5(merchantSecret)}`);
    if (merchantSecret && md5sig && localSig !== String(md5sig).toUpperCase()) {
      return res.status(400).send("Invalid payment signature");
    }

    payment.paymentStatus = statusFromPayHere(status_code);
    payment.paymentDate = new Date();
    payment.gatewayPaymentId = payment_id;
    payment.gatewayMethod = method;
    payment.maskedCard = card_no;
    payment.cardExpiry = card_expiry;
    payment.cardBrand = method;
    if (payment.paymentStatus === "Paid") payment.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await payment.save();

    if (payment.paymentStatus === "Paid") {
      const user = await User.findOne({ email: payment.userEmail });
      if (user) {
        await Notification.create({
          user: user._id,
          title: "Payment successful",
          message: `${payment.plan} plan activated until ${payment.expiryDate.toDateString()}.`,
          type: "report"
        });
      }
    }

    res.send("OK");
  } catch (error) {
    res.status(500).send(error.message);
  }
});

router.get("/payhere/return", (req, res) => {
  res.send("LifeBuddy payment submitted. You can return to the app and refresh payment history.");
});

router.get("/payhere/cancel", async (req, res) => {
  if (req.query.order_id) await Payment.findOneAndUpdate({ gatewayOrderId: req.query.order_id }, { paymentStatus: "Failed" });
  res.send("LifeBuddy payment was cancelled. You can return to the app.");
});

router.post("/pay", protect, async (req, res) => {
  try {
    if (process.env.ALLOW_DEMO_PAYMENTS !== "true") {
      return res.status(403).json({ message: "Demo payments are disabled. Use secure gateway checkout or manual bank slip upload." });
    }

    const { plan = "Premium" } = req.body;
    const payment = await Payment.create({
      userEmail: req.user.email,
      plan,
      amount: planAmount(plan),
      paymentStatus: "Paid",
      paymentDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      gateway: "Demo"
    });

    const subscription = await getSubscriptionStatus(req.user);
    await Notification.create({
      user: req.user._id,
      title: "Payment successful",
      message: `${plan} plan activated until ${payment.expiryDate.toDateString()}.`,
      type: "report"
    });
    res.status(201).json({ payment: publicPayment(payment, req), subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/admin-record", protect, adminOnly, async (req, res) => {
  try {
    const payment = await Payment.create(req.body);
    res.status(201).json(publicPayment(payment, req));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/history", protect, async (req, res) => {
  const payments = await Payment.find({ userEmail: req.user.email }).sort({ paymentDate: -1 });
  res.json(payments.map((payment) => publicPayment(payment, req)));
});

module.exports = router;
