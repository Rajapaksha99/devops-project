// server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";

import http from "http";
import { Server } from "socket.io";
import { NodeSSH } from "node-ssh";
import jwt from "jsonwebtoken";
import Serverip from "./models/Serverip.js";

// Import models
import User from "./models/User.js";
import ServerSession from "./models/ServerSession.js";
import Command from "./models/Command.js";
import AllowedEmail from "./models/AllowedEmail.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

// Auth middleware for admin routes
const authenticateAdmin = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin role required.' 
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token.' 
    });
  }
};

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);

// ===== STUDENT REGISTRATION WITH ALLOWED EMAIL VALIDATION =====

// Student Registration with AllowedEmail validation
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, registered_id, password } = req.body;

    console.log('Registration attempt:', { name, email, registered_id });

    // Validation - check required fields
    if (!name || !email || !registered_id || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: name, email, registered_id, and password"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address"
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long"
      });
    }

    // CRITICAL: Check if email and registered_id combination exists in AllowedEmail collection
    const allowedStudent = await AllowedEmail.findOne({
      email: email.toLowerCase().trim(),
      registered_id: registered_id.trim()
    });

    if (!allowedStudent) {
      console.log('Registration denied: Email and Student ID combination not found in allowed list');
      return res.status(403).json({
        success: false,
        message: "Registration denied. Your email and student ID combination is not authorized for registration. Please contact your administrator."
      });
    }

    // Check if user already exists in Users collection
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { registered_id: registered_id.trim() }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email.toLowerCase().trim() 
          ? "Email already registered" 
          : "Student ID already registered"
      });
    }

    // Hash password
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with data from AllowedEmail
    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      registered_id: registered_id.trim(),
      password: hashedPassword,
      role: allowedStudent.role || 'student' // Use role from AllowedEmail
    });

    await newUser.save();

    console.log(`New user registered successfully: ${newUser.email} (ID: ${newUser.registered_id})`);

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: newUser._id, 
        email: newUser.email, 
        role: newUser.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return success response
    res.status(201).json({
      success: true,
      message: "Registration successful! You can now log in to the system.",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        registered_id: newUser.registered_id,
        role: newUser.role
      },
      token: token
    });

  } catch (error) {
    console.error("Registration error:", error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' 
        ? 'Email already registered' 
        : 'Student ID already registered';
      
      return res.status(400).json({
        success: false,
        message: message
      });
    }

    res.status(500).json({
      success: false,
      message: "Registration failed due to server error. Please try again.",
      error: error.message
    });
  }
});

// Student Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    // Find user by email
    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Verify password
    const bcrypt = await import('bcrypt');
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        role: user.role,
        name: user.name,
        registered_id: user.registered_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`User logged in successfully: ${user.email}`);

    // Return success response
    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        registered_id: user.registered_id,
        role: user.role
      },
      token: token
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed due to server error. Please try again.",
      error: error.message
    });
  }
});

// ===== ALLOWED EMAIL MANAGEMENT ENDPOINTS =====

// Get all allowed emails (students)
app.get("/api/admin/allowed-emails", authenticateAdmin, async (req, res) => {
  try {
    console.log('Fetching allowed emails...');
    
    const allowedEmails = await AllowedEmail.find()
      .sort({ createdAt: -1 });
    
    console.log(`Found ${allowedEmails.length} allowed emails`);
    
    res.json(allowedEmails);
  } catch (error) {
    console.error("Error fetching allowed emails:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch allowed emails",
      error: error.message 
    });
  }
});

// Add new student to allowed emails
app.post("/api/admin/students/allowed", authenticateAdmin, async (req, res) => {
  try {
    const { name, email, registered_id, role = 'student' } = req.body;

    console.log('Adding new allowed student:', { name, email, registered_id, role });

    // Validation
    if (!name || !email || !registered_id) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and registered ID are required"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address"
      });
    }

    // Check if email already exists
    const existingEmail = await AllowedEmail.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists in allowed list"
      });
    }

    // Check if registered_id already exists
    const existingId = await AllowedEmail.findOne({ 
      registered_id: registered_id.trim() 
    });
    
    if (existingId) {
      return res.status(400).json({
        success: false,
        message: "Student ID already exists in allowed list"
      });
    }

    // Create new allowed email entry
    const newAllowedEmail = new AllowedEmail({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      registered_id: registered_id.trim(),
      role: role
    });

    await newAllowedEmail.save();

    console.log('Successfully added new allowed student:', newAllowedEmail);

    res.status(201).json({
      success: true,
      message: "Student added successfully to allowed list!",
      data: newAllowedEmail
    });

  } catch (error) {
    console.error("Error adding allowed student:", error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' 
        ? 'Email already exists in allowed list' 
        : 'Student ID already exists in allowed list';
      
      return res.status(400).json({
        success: false,
        message: message
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to add student to allowed list",
      error: error.message
    });
  }
});

// Update allowed student
app.put("/api/admin/students/allowed/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, registered_id, role } = req.body;

    console.log('Updating allowed student:', { id, name, email, registered_id, role });

    // Validation
    if (!name || !email || !registered_id) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and registered ID are required"
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address"
      });
    }

    // Check if email already exists (excluding current record)
    const existingEmail = await AllowedEmail.findOne({ 
      email: email.toLowerCase().trim(),
      _id: { $ne: id }
    });
    
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already exists in allowed list"
      });
    }

    // Check if registered_id already exists (excluding current record)
    const existingId = await AllowedEmail.findOne({ 
      registered_id: registered_id.trim(),
      _id: { $ne: id }
    });
    
    if (existingId) {
      return res.status(400).json({
        success: false,
        message: "Student ID already exists in allowed list"
      });
    }

    // Update the record
    const updatedStudent = await AllowedEmail.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        registered_id: registered_id.trim(),
        role: role || 'student'
      },
      { new: true, runValidators: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    console.log('Successfully updated allowed student:', updatedStudent);

    res.json({
      success: true,
      message: "Student updated successfully",
      data: updatedStudent
    });

  } catch (error) {
    console.error("Error updating allowed student:", error);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' 
        ? 'Email already exists in allowed list' 
        : 'Student ID already exists in allowed list';
      
      return res.status(400).json({
        success: false,
        message: message
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update student",
      error: error.message
    });
  }
});

// Delete allowed student
app.delete("/api/admin/students/allowed/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    console.log('Deleting allowed student with ID:', id);

    // Validate the ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID format"
      });
    }

    // Find and delete the student
    const deletedStudent = await AllowedEmail.findByIdAndDelete(id);

    if (!deletedStudent) {
      return res.status(404).json({
        success: false,
        message: "Student not found in allowed list"
      });
    }

    console.log('Successfully deleted allowed student:', deletedStudent.email);

    res.json({
      success: true,
      message: `Student "${deletedStudent.email}" removed from allowed list successfully!`,
      data: deletedStudent
    });

  } catch (error) {
    console.error("Error deleting allowed student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete student from allowed list",
      error: error.message
    });
  }
});

// Get registered students (from Users collection)
app.get("/api/admin/students", authenticateAdmin, async (req, res) => {
  try {
    console.log('Fetching registered students...');
    
    // Fetch users with role 'student' and include their session statistics
    const students = await User.find({ role: 'student' })
      .select('name email registered_id created_at updated_at')
      .sort({ created_at: -1 });

    // Get session statistics for each student
    const studentsWithStats = await Promise.all(
      students.map(async (student) => {
        try {
          // Get session statistics
          const totalSessions = await ServerSession.countDocuments({ 
            user_id: student._id 
          });
          
          const activeSessions = await ServerSession.countDocuments({ 
            user_id: student._id, 
            status: 'active' 
          });
          
          // Calculate total duration
          const sessions = await ServerSession.find({ 
            user_id: student._id, 
            session_duration: { $exists: true, $ne: null } 
          }).select('session_duration');
          
          const totalDuration = sessions.reduce((sum, session) => 
            sum + (session.session_duration || 0), 0
          );
          
          // Get last activity
          const lastSession = await ServerSession.findOne({ 
            user_id: student._id 
          }).sort({ login_time: -1 }).select('logout_time login_time');
          
          const lastActivity = lastSession 
            ? (lastSession.logout_time || lastSession.login_time) 
            : null;

          return {
            ...student.toObject(),
            id: student._id, // Add id field for compatibility
            statistics: {
              total_sessions: totalSessions,
              active_sessions: activeSessions,
              total_duration: totalDuration,
              last_activity: lastActivity
            }
          };
        } catch (err) {
          console.error(`Error getting stats for student ${student._id}:`, err);
          return {
            ...student.toObject(),
            id: student._id,
            statistics: {
              total_sessions: 0,
              active_sessions: 0,
              total_duration: 0,
              last_activity: null
            }
          };
        }
      })
    );

    console.log(`Found ${studentsWithStats.length} registered students`);

    res.json(studentsWithStats);
  } catch (error) {
    console.error("Error fetching registered students:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch registered students",
      error: error.message 
    });
  }
});

// ===== EXISTING SERVER MANAGEMENT ROUTES =====

// Get all active servers (updated to work with StudentDashboard)
app.get("/api/servers", async (req, res) => {
  try {
    const servers = await Serverip.find({ status: "active" })
      .select('name ip port description status max_connections created_at updated_at')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      servers: servers
    });
  } catch (error) {
    console.error("Error fetching servers:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch servers" 
    });
  }
});

// Get all servers (including inactive ones) - for admin panel
app.get("/api/servers/all", async (req, res) => {
  try {
    const servers = await Serverip.find()
      .select('name ip port description status max_connections created_at updated_at')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      servers: servers
    });
  } catch (error) {
    console.error("Error fetching all servers:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch servers" 
    });
  }
});

// Add a new server (admin only)
app.post("/api/servers", async (req, res) => {
  try {
    const { name, ip, port, description, max_connections } = req.body;
    
    if (!name || !ip) {
      return res.status(400).json({
        success: false,
        error: "Server name and IP are required"
      });
    }

    // Check if server with same IP already exists
    const existingServer = await Serverip.findOne({ ip });
    if (existingServer) {
      return res.status(400).json({
        success: false,
        error: "Server with this IP already exists"
      });
    }

    const newServer = new Serverip({
      name,
      ip,
      port: port || 22,
      description: description || "",
      max_connections: max_connections || 100
    });

    await newServer.save();
    
    res.status(201).json({
      success: true,
      message: "Server added successfully",
      server: newServer
    });
  } catch (error) {
    console.error("Error adding server:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add server"
    });
  }
});

// Update server status
app.patch("/api/servers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, name, description, port, max_connections } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (port) updateData.port = port;
    if (max_connections) updateData.max_connections = max_connections;

    const server = await Serverip.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    );

    if (!server) {
      return res.status(404).json({
        success: false,
        error: "Server not found"
      });
    }

    res.json({
      success: true,
      message: "Server updated successfully",
      server: server
    });
  } catch (error) {
    console.error("Error updating server:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update server"
    });
  }
});

// Delete server
app.delete("/api/servers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const server = await Serverip.findByIdAndDelete(id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: "Server not found"
      });
    }

    res.json({
      success: true,
      message: "Server deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting server:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete server"
    });
  }
});

// Get server by ID
app.get("/api/servers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const server = await Serverip.findById(id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: "Server not found"
      });
    }

    res.json({
      success: true,
      server: server
    });
  } catch (error) {
    console.error("Error fetching server:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch server"
    });
  }
});

// HTTP + WebSocket server
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Store active sessions
const activeSessions = new Map();

io.on("connection", (socket) => {
  console.log("Client connected");
  
  const ssh = new NodeSSH();
  let currentSession = null;
  let commandBuffer = "";
  let currentCommand = null;

  // Handle multiple event names and data structures
  const handleSSHConnect = async (connectionData) => {
    console.log("Received SSH connection data:", connectionData);
    
    try {
      // Extract connection details with fallback support
      const host = connectionData.host;
      const username = connectionData.username;
      const password = connectionData.password;
      const port = connectionData.port || 22;
      const serverName = connectionData.serverName || connectionData.server_name || `Server ${host}`;
      
      // Handle different user data structures - updated for StudentDashboard compatibility
      let userData = null;
      
      // New structure from StudentDashboard: { userId, userEmail, userName, registeredId, userRole }
      if (connectionData.userId) {
        userData = {
          id: connectionData.userId,
          name: connectionData.userName,
          email: connectionData.userEmail,
          registered_id: connectionData.registeredId,
          role: connectionData.userRole
        };
      }
      // Legacy structure: { user: {...} }
      else if (connectionData.user) {
        userData = {
          id: connectionData.user.id,
          name: connectionData.user.name,
          email: connectionData.user.email,
          registered_id: connectionData.user.registered_id,
          role: connectionData.user.role
        };
      }
      // Legacy structure: { user_data: {...} }
      else if (connectionData.user_data) {
        userData = connectionData.user_data;
      }
      // Direct properties structure (fallback)
      else {
        userData = {
          id: connectionData.user_id || connectionData.id,
          name: connectionData.user_name || connectionData.name,
          email: connectionData.user_email || connectionData.email,
          registered_id: connectionData.registered_id,
          role: connectionData.user_role || connectionData.role
        };
      }

      console.log("Extracted user data:", userData);
      console.log("Attempting SSH connection to:", { host, username, port });

      if (!host || !username || !password) {
        throw new Error("Missing required connection parameters: host, username, or password");
      }

      if (!userData || !userData.id) {
        throw new Error("Missing or invalid user data");
      }

      // Attempt SSH connection
      await ssh.connect({ 
        host, 
        username, 
        password,
        port,
        readyTimeout: 20000, // 20 second timeout
        keepaliveInterval: 5000
      });
      
      console.log(`SSH connected successfully to ${host}`);
      socket.emit("ssh-connected", { host, username, serverName });

      // Create new session record
      currentSession = new ServerSession({
        user_id: userData.id,
        server_ip: host,
        server_name: serverName,
        ssh_username: username,
        login_time: new Date(),
        status: "active"
      });
      
      await currentSession.save();
      
      // Store in active sessions map
      activeSessions.set(socket.id, {
        sessionId: currentSession._id,
        userId: userData.id,
        serverIp: host,
        loginTime: new Date()
      });

      console.log(`Session created for user ${userData.name} on server ${host}`);

      // Get the shell stream
      const stream = await ssh.requestShell();

      // When server sends output
      stream.on("data", (data) => {
        const output = data.toString();
        socket.emit("ssh-output", output);
        
        // Store command output if we have a current command
        if (currentCommand) {
          currentCommand.output += output;
        }
      });

      stream.on("close", () => {
        console.log("SSH stream closed");
        socket.emit("ssh-disconnected");
        handleSessionEnd();
      });

      stream.on("error", (error) => {
        console.error("SSH stream error:", error);
        socket.emit("ssh-error", { message: error.message });
      });

      // When client sends commands
      socket.on("ssh-input", async (input) => {
        if (stream && !stream.destroyed) {
          stream.write(input);
          
          // Track commands (when Enter is pressed)
          if (input.includes('\r') || input.includes('\n')) {
            const command = commandBuffer.trim();
            
            if (command && command.length > 0 && currentSession) {
              // Save command to database
              try {
                const newCommand = new Command({
                  session_id: currentSession._id,
                  user_id: userData.id,
                  server_ip: host,
                  command: command,
                  executed_at: new Date(),
                  output: "" // Initialize output
                });
                
                currentCommand = await newCommand.save();
                
                // Add command to session
                currentSession.commands_executed.push(currentCommand._id);
                await currentSession.save();
                
                console.log(`Command logged: ${command} by user ${userData.name}`);
                
                // Clear current command after a delay to capture output
                setTimeout(async () => {
                  if (currentCommand) {
                    await currentCommand.save();
                    currentCommand = null;
                  }
                }, 2000); // Increased delay to capture more output
                
              } catch (err) {
                console.error("Error saving command:", err);
              }
            }
            
            commandBuffer = "";
          } else {
            commandBuffer += input;
          }
        } else {
          console.error("SSH stream is not available or destroyed");
          socket.emit("ssh-error", { message: "SSH connection lost" });
        }
      });

    } catch (err) {
      console.error("SSH connection error:", err);
      const errorMessage = err.message || "Unknown SSH connection error";
      socket.emit("ssh-error", { message: errorMessage });
    }
  };

  // Listen for multiple event types for compatibility
  socket.on("ssh-connect", handleSSHConnect);
  socket.on("ssh-connect-enhanced", handleSSHConnect);
  socket.on("connect-ssh", handleSSHConnect);

  // Handle user activity tracking
  socket.on("user-activity", (activityData) => {
    console.log("User activity:", activityData);
    // You can log this to database if needed
  });

  // Handle user disconnect events
  socket.on("user-disconnect", (disconnectData) => {
    console.log("User disconnect:", disconnectData);
    handleSessionEnd();
  });

  const handleSessionEnd = async () => {
    if (currentSession) {
      try {
        const logoutTime = new Date();
        const duration = Math.floor((logoutTime - currentSession.login_time) / 1000);
        
        currentSession.logout_time = logoutTime;
        currentSession.session_duration = duration;
        currentSession.status = "disconnected";
        
        await currentSession.save();
        
        // Remove from active sessions
        activeSessions.delete(socket.id);
        
        console.log(`Session ended for user on server ${currentSession.server_ip}. Duration: ${duration}s`);
      } catch (err) {
        console.error("Error ending session:", err);
      }
    }
  };

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    
    // Clean up SSH connection
    if (ssh) {
      ssh.dispose();
    }
    
    // End session tracking
    handleSessionEnd();
  });

  // Handle connection errors
  socket.on("error", (error) => {
    console.error("Socket error:", error);
  });
});

// Add API endpoint to get active sessions (useful for admin)
app.get("/api/active-sessions", async (req, res) => {
  try {
    const sessions = Array.from(activeSessions.values());
    res.json({
      count: sessions.length,
      sessions: sessions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get server statistics
app.get("/api/server-stats", async (req, res) => {
  try {
    const totalServers = await Serverip.countDocuments();
    const activeServers = await Serverip.countDocuments({ status: "active" });
    const inactiveServers = await Serverip.countDocuments({ status: "inactive" });
    const maintenanceServers = await Serverip.countDocuments({ status: "maintenance" });
    const activeSessions = activeSessions.size;

    res.json({
      success: true,
      stats: {
        totalServers,
        activeServers,
        inactiveServers,
        maintenanceServers,
        activeSessions
      }
    });
  } catch (error) {
    console.error("Error fetching server stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch server statistics"
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});