// models/Server.js
import mongoose from "mongoose";

const serverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  ip: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        // Basic IP validation
        return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(v);
      },
      message: 'Invalid IP address format'
    }
  },
  port: {
    type: Number,
    default: 22
  },
  description: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    enum: ["active", "inactive", "maintenance"],
    default: "active"
  },
  max_connections: {
    type: Number,
    default: 100
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Update the updated_at field before saving
serverSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Model name is "Serverip"
export default mongoose.model("Serverip", serverSchema);
