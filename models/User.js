const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    age: Number,
    height: Number,
    weight: Number,
    healthGoal: { type: String, default: "Improve daily wellness" },
    emergencyContact: String,
    dailyTargets: {
      waterLiters: { type: Number, default: 2 },
      sleepHours: { type: Number, default: 7 },
      exerciseMinutes: { type: Number, default: 30 }
    },
    medicines: [
      {
        name: String,
        dosage: String,
        time: String
      }
    ],
    role: { type: String, enum: ["user", "admin"], default: "user" },
    freeTrialStart: { type: Date, default: Date.now },
    freeTrialEnd: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  },
  { timestamps: true }
);

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.matchPassword = function matchPassword(enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
