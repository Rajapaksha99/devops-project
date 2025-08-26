// models/AllowedEmail.js
import mongoose from "mongoose";

const allowedEmailSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true,
    lowercase: true,
    trim: true
  },
  role: { 
    type: String, 
    enum: ["admin", "student"], 
    required: true,
    default: "student"
  },
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  registered_id: { 
    type: String, 
    required: true,
    unique: true,
    index: true,
    trim: true
  }
}, { 
  timestamps: true 
});

// Indexes for better performance
allowedEmailSchema.index({ email: 1, registered_id: 1 });

export default mongoose.model("AllowedEmail", allowedEmailSchema);