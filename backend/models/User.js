// models/User.js
import mongoose from "mongoose";
import AllowedEmail from "../models/AllowedEmail.js";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "student"], required: true },
  registered_id: { type: String, required: true, unique: true } // ✅ must come from frontend
});

// ✅ Pre-save hook → only validate allowed email
userSchema.pre("save", async function (next) {
  try {
    console.log("Pre-save hook running. Incoming registered_id:", this.registered_id);

    // check AllowedEmail
    const allowed = await AllowedEmail.findOne({ email: this.email, role: this.role });
    if (!allowed) {
      return next(new Error(`This email cannot register as ${this.role}`));
    }

    // enforce registered_id must exist
    if (!this.registered_id) {
      return next(new Error("Registered ID is required and must be provided by user"));
    }

    next();
  } catch (err) {
    next(err);
  }
});

export default mongoose.model("User", userSchema);
