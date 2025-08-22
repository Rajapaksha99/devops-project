import mongoose from "mongoose";

const allowedEmailSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  role: { type: String, enum: ["admin", "student"], required: true }
}, { timestamps: true });

export default mongoose.model("AllowedEmail", allowedEmailSchema);
