import mongoose from "mongoose";

const commandSchema = new mongoose.Schema({
  session_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "ServerSession", 
    required: true,
    index: true
  },
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
  command: { 
    type: String, 
    required: true 
  },
  output: { 
    type: String, 
    default: "" 
  },
  executed_at: { 
    type: Date, 
    required: true, 
    default: Date.now,
    index: true
  },
  execution_time: { 
    type: Number, // Time taken to execute in milliseconds
    default: 0 
  },
  exit_code: { 
    type: Number,
    default: null
  },
  // Command classification
  command_type: {
    type: String,
    enum: ["system", "file", "network", "process", "custom", "unknown"],
    default: "unknown"
  },
  is_dangerous: {
    type: Boolean,
    default: false
  },
  // Metadata
  working_directory: String,
  environment_vars: mongoose.Schema.Types.Mixed
}, { 
  timestamps: true,
  // Add compound indexes for better query performance
  index: [
    { session_id: 1, executed_at: 1 },
    { user_id: 1, executed_at: -1 },
    { server_ip: 1, executed_at: -1 }
  ]
});

// Pre-save middleware to classify commands and detect dangerous ones
commandSchema.pre('save', function(next) {
  if (this.command && this.isNew) {
    this.classifyCommand();
    this.checkIfDangerous();
  }
  next();
});

// Instance method to classify command type
commandSchema.methods.classifyCommand = function() {
  const cmd = this.command.toLowerCase().trim();
  
  // System commands
  if (/^(ls|pwd|cd|whoami|id|uname|uptime|date|cal|history)(\s|$)/.test(cmd)) {
    this.command_type = "system";
  }
  // File operations
  else if (/^(cat|less|more|head|tail|grep|find|locate|which|file|stat|touch|mkdir|rmdir|cp|mv|ln|chmod|chown|chgrp)(\s|$)/.test(cmd)) {
    this.command_type = "file";
  }
  // Network commands
  else if (/^(ping|wget|curl|ssh|scp|ftp|telnet|netstat|ss|lsof|iptables)(\s|$)/.test(cmd)) {
    this.command_type = "network";
  }
  // Process management
  else if (/^(ps|top|htop|jobs|kill|killall|nohup|screen|tmux|bg|fg)(\s|$)/.test(cmd)) {
    this.command_type = "process";
  }
  // Custom/unknown
  else {
    this.command_type = "custom";
  }
};

// Instance method to check if command is potentially dangerous
commandSchema.methods.checkIfDangerous = function() {
  const cmd = this.command.toLowerCase().trim();
  
  const dangerousPatterns = [
    /^rm\s+-rf?\s+\//,  // rm -rf /
    /^dd\s+if=/,        // dd commands
    /^mkfs/,            // format commands
    /^fdisk/,           // disk partitioning
    /^:(){ :\|:& };:/,  // fork bomb
    /^sudo\s+rm/,       // sudo rm commands
    /\bsudo\b.*\bpasswd\b/, // password changes
    /^chmod\s+777/,     // overly permissive permissions
    /^curl.*\|\s*sh$/,  // pipe to shell
    /^wget.*\|\s*sh$/,  // pipe to shell
    /\/dev\/(null|zero|random|urandom).*>/  // redirect to devices
  ];
  
  this.is_dangerous = dangerousPatterns.some(pattern => pattern.test(cmd));
};

// Static method to get command statistics
commandSchema.statics.getCommandStats = function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: {
          command_type: "$command_type",
          is_dangerous: "$is_dangerous"
        },
        count: { $sum: 1 },
        commands: { $push: "$command" },
        avg_execution_time: { $avg: "$execution_time" }
      }
    },
    {
      $group: {
        _id: null,
        total_commands: { $sum: "$count" },
        by_type: {
          $push: {
            type: "$_id.command_type",
            count: "$count",
            avg_execution_time: "$avg_execution_time"
          }
        },
        dangerous_commands: {
          $sum: {
            $cond: [{ $eq: ["$_id.is_dangerous", true] }, "$count", 0]
          }
        }
      }
    }
  ];
  
  return this.aggregate(pipeline);
};

// Static method to find most used commands
commandSchema.statics.getMostUsedCommands = function(limit = 10, filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: "$command",
        count: { $sum: 1 },
        users: { $addToSet: "$user_id" },
        servers: { $addToSet: "$server_ip" },
        last_used: { $max: "$executed_at" }
      }
    },
    {
      $project: {
        command: "$_id",
        count: 1,
        unique_users: { $size: "$users" },
        unique_servers: { $size: "$servers" },
        last_used: 1,
        _id: 0
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ];
  
  return this.aggregate(pipeline);
};

// Static method to find dangerous commands
commandSchema.statics.getDangerousCommands = function(filters = {}) {
  return this.find({ ...filters, is_dangerous: true })
    .populate('user_id', 'name email registered_id')
    .populate('session_id', 'server_name server_ip login_time')
    .sort({ executed_at: -1 });
};

export default mongoose.model("Command", commandSchema);