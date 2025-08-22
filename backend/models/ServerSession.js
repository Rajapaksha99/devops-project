import mongoose from "mongoose";

const serverSessionSchema = new mongoose.Schema({
  user_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true,
    index: true
  },
  server_ip: { 
    type: String, 
    required: true,
    index: true
  },
  server_name: { 
    type: String, 
    required: true 
  },
  ssh_username: { 
    type: String, 
    required: true 
  },
  login_time: { 
    type: Date, 
    required: true, 
    default: Date.now,
    index: true
  },
  logout_time: { 
    type: Date 
  },
  session_duration: { 
    type: Number, // Duration in seconds
    default: 0
  },
  status: { 
    type: String, 
    enum: ["active", "disconnected", "timeout"], 
    default: "active",
    index: true
  },
  commands_executed: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Command"
  }],
  // Additional session metadata
  browser_info: {
    user_agent: String,
    window_id: String,
    referrer: String
  },
  connection_metadata: {
    socket_id: String,
    connection_time: Date,
    dashboard_url: String
  }
}, { 
  timestamps: true,
  // Add indexes for better query performance
  index: [
    { user_id: 1, login_time: -1 },
    { server_ip: 1, login_time: -1 },
    { status: 1, login_time: -1 }
  ]
});

// Pre-save middleware to calculate session duration
serverSessionSchema.pre('save', function(next) {
  if (this.logout_time && this.login_time && !this.session_duration) {
    this.session_duration = Math.floor((this.logout_time - this.login_time) / 1000);
  }
  next();
});

// Instance method to end session
serverSessionSchema.methods.endSession = function(reason = 'disconnected') {
  this.logout_time = new Date();
  this.session_duration = Math.floor((this.logout_time - this.login_time) / 1000);
  this.status = reason;
  return this.save();
};

// Static method to find active sessions
serverSessionSchema.statics.findActiveSessions = function() {
  return this.find({ status: 'active' })
    .populate('user_id', 'name email registered_id role')
    .sort({ login_time: -1 });
};

// Static method to get session statistics
serverSessionSchema.statics.getSessionStats = function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        total_sessions: { $sum: 1 },
        active_sessions: {
          $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
        },
        avg_duration: { $avg: "$session_duration" },
        total_duration: { $sum: "$session_duration" },
        unique_users: { $addToSet: "$user_id" },
        unique_servers: { $addToSet: "$server_ip" }
      }
    },
    {
      $project: {
        total_sessions: 1,
        active_sessions: 1,
        avg_duration: { $round: ["$avg_duration", 2] },
        total_duration: 1,
        unique_user_count: { $size: "$unique_users" },
        unique_server_count: { $size: "$unique_servers" },
        _id: 0
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

export default mongoose.model("ServerSession", serverSessionSchema);