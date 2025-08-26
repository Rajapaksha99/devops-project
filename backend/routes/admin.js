import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import ServerSession from "../models/ServerSession.js";
import Command from "../models/Command.js";
import AllowedEmail from "../models/AllowedEmail.js";

const router = express.Router();

// Middleware to verify admin token
const verifyAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    req.admin = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// Get all servers with session counts
router.get("/servers", verifyAdmin, async (req, res) => {
  try {
    const servers = await ServerSession.aggregate([
      {
        $group: {
          _id: {
            server_ip: "$server_ip",
            server_name: "$server_name"
          },
          total_sessions: { $sum: 1 },
          active_sessions: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0]
            }
          },
          last_activity: { $max: "$login_time" },
          unique_users: { $addToSet: "$user_id" }
        }
      },
      {
        $project: {
          server_ip: "$_id.server_ip",
          server_name: "$_id.server_name",
          total_sessions: 1,
          active_sessions: 1,
          last_activity: 1,
          unique_user_count: { $size: "$unique_users" },
          _id: 0
        }
      },
      { $sort: { last_activity: -1 } }
    ]);

    res.json(servers);
  } catch (error) {
    console.error("Error fetching servers:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get sessions for a specific server (last 10 sessions)
router.get("/servers/:serverIp/sessions", verifyAdmin, async (req, res) => {
  try {
    const { serverIp } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const sessions = await ServerSession.find({ 
      server_ip: serverIp 
    })
    .populate('user_id', 'name email registered_id role')
    .populate('commands_executed')
    .sort({ login_time: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset));

    // Get total count for pagination
    const totalCount = await ServerSession.countDocuments({ server_ip: serverIp });

    // Format the response
    const formattedSessions = sessions.map(session => ({
      id: session._id,
      user: {
        name: session.user_id?.name || 'Unknown',
        email: session.user_id?.email || 'N/A',
        registered_id: session.user_id?.registered_id || 'N/A',
        role: session.user_id?.role || 'student'
      },
      server_info: {
        ip: session.server_ip,
        name: session.server_name,
        ssh_username: session.ssh_username
      },
      session_details: {
        login_time: session.login_time,
        logout_time: session.logout_time,
        session_duration: session.session_duration,
        status: session.status
      },
      commands_count: session.commands_executed?.length || 0,
      created_at: session.createdAt,
      updated_at: session.updatedAt
    }));

    res.json({
      sessions: formattedSessions,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: (parseInt(offset) + parseInt(limit)) < totalCount
      }
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get detailed session with all commands
router.get("/sessions/:sessionId", verifyAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await ServerSession.findById(sessionId)
      .populate('user_id', 'name email registered_id role')
      .populate({
        path: 'commands_executed',
        options: { sort: { executed_at: 1 } }
      });

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    // Format the detailed response
    const detailedSession = {
      id: session._id,
      user: {
        id: session.user_id?._id,
        name: session.user_id?.name || 'Unknown',
        email: session.user_id?.email || 'N/A',
        registered_id: session.user_id?.registered_id || 'N/A',
        role: session.user_id?.role || 'student'
      },
      server_info: {
        ip: session.server_ip,
        name: session.server_name,
        ssh_username: session.ssh_username
      },
      session_details: {
        login_time: session.login_time,
        logout_time: session.logout_time,
        session_duration: session.session_duration,
        status: session.status
      },
      commands: session.commands_executed?.map(cmd => ({
        id: cmd._id,
        command: cmd.command,
        output: cmd.output,
        executed_at: cmd.executed_at,
        duration: cmd.execution_time
      })) || [],
      created_at: session.createdAt,
      updated_at: session.updatedAt
    };

    res.json(detailedSession);
  } catch (error) {
    console.error("Error fetching session details:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get all students (registered users)
router.get("/students", verifyAdmin, async (req, res) => {
  try {
    const students = await User.find({ role: "student" }).select("-password");
    
    // Get session statistics for each student
    const studentsWithStats = await Promise.all(
      students.map(async (student) => {
        const sessionStats = await ServerSession.aggregate([
          { $match: { user_id: student._id } },
          {
            $group: {
              _id: null,
              total_sessions: { $sum: 1 },
              active_sessions: {
                $sum: {
                  $cond: [{ $eq: ["$status", "active"] }, 1, 0]
                }
              },
              total_duration: { $sum: "$session_duration" },
              last_activity: { $max: "$login_time" }
            }
          }
        ]);

        const stats = sessionStats[0] || {
          total_sessions: 0,
          active_sessions: 0,
          total_duration: 0,
          last_activity: null
        };

        return {
          id: student._id,
          name: student.name,
          email: student.email,
          registered_id: student.registered_id,
          role: student.role,
          statistics: stats,
          created_at: student.createdAt
        };
      })
    );

    res.json(studentsWithStats);
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get student's session history
router.get("/students/:studentId/sessions", verifyAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { limit = 10, offset = 0 } = req.query;

    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const sessions = await ServerSession.find({ user_id: studentId })
      .populate('commands_executed')
      .sort({ login_time: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    const totalCount = await ServerSession.countDocuments({ user_id: studentId });

    const formattedSessions = sessions.map(session => ({
      id: session._id,
      server_info: {
        ip: session.server_ip,
        name: session.server_name,
        ssh_username: session.ssh_username
      },
      session_details: {
        login_time: session.login_time,
        logout_time: session.logout_time,
        session_duration: session.session_duration,
        status: session.status
      },
      commands_count: session.commands_executed?.length || 0,
      created_at: session.createdAt
    }));

    res.json({
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        registered_id: student.registered_id
      },
      sessions: formattedSessions,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: (parseInt(offset) + parseInt(limit)) < totalCount
      }
    });
  } catch (error) {
    console.error("Error fetching student sessions:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get dashboard statistics
router.get("/dashboard/stats", verifyAdmin, async (req, res) => {
  try {
    const [
      totalStudents,
      totalSessions,
      activeSessions,
      totalCommands,
      recentActivity
    ] = await Promise.all([
      User.countDocuments({ role: "student" }),
      ServerSession.countDocuments(),
      ServerSession.countDocuments({ status: "active" }),
      Command.countDocuments(),
      ServerSession.find()
        .populate('user_id', 'name email registered_id')
        .sort({ login_time: -1 })
        .limit(5)
    ]);

    // Get server usage statistics
    const serverUsage = await ServerSession.aggregate([
      {
        $group: {
          _id: "$server_ip",
          server_name: { $first: "$server_name" },
          session_count: { $sum: 1 },
          unique_users: { $addToSet: "$user_id" }
        }
      },
      {
        $project: {
          server_ip: "$_id",
          server_name: 1,
          session_count: 1,
          unique_user_count: { $size: "$unique_users" },
          _id: 0
        }
      },
      { $sort: { session_count: -1 } }
    ]);

    res.json({
      overview: {
        total_students: totalStudents,
        total_sessions: totalSessions,
        active_sessions: activeSessions,
        total_commands: totalCommands
      },
      server_usage: serverUsage,
      recent_activity: recentActivity.map(session => ({
        id: session._id,
        user_name: session.user_id?.name || 'Unknown',
        user_email: session.user_id?.email || 'N/A',
        server_name: session.server_name,
        server_ip: session.server_ip,
        login_time: session.login_time,
        status: session.status
      }))
    });
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== ENHANCED STUDENT MANAGEMENT ROUTES ====================

// Add student to AllowedEmail collection (enhanced with name and registered_id)
router.post("/students/allowed", verifyAdmin, async (req, res) => {
  try {
    const { name, email, registered_id, role = "student" } = req.body;

    if (!name || !email || !registered_id) {
      return res.status(400).json({ 
        message: "Name, email, and registered ID are required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: "Please enter a valid email address" 
      });
    }

    // Check if email already exists in AllowedEmail
    const existingEmail = await AllowedEmail.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ 
        message: "Email already exists in allowed list" 
      });
    }

    // Check if registered_id already exists in AllowedEmail
    const existingId = await AllowedEmail.findOne({ registered_id });
    if (existingId) {
      return res.status(400).json({ 
        message: "Registered ID already exists in allowed list" 
      });
    }

    // Check if user is already registered
    const existingUser = await User.findOne({ 
      $or: [{ email }, { registered_id }] 
    });
    if (existingUser) {
      return res.status(400).json({ 
        message: "Student with this email or registered ID is already registered" 
      });
    }

    const allowedStudent = new AllowedEmail({ 
      name, 
      email, 
      registered_id, 
      role 
    });
    
    await allowedStudent.save();

    res.status(201).json({
      message: "Student added to allowed list successfully",
      student: allowedStudent
    });
  } catch (error) {
    console.error("Error adding student to allowed list:", error);
    res.status(500).json({ message: error.message });
  }
});

// Get all allowed emails (students not yet registered)
router.get("/allowed-emails", verifyAdmin, async (req, res) => {
  try {
    const allowedEmails = await AllowedEmail.find().sort({ createdAt: -1 });
    res.json(allowedEmails);
  } catch (error) {
    console.error("Error fetching allowed emails:", error);
    res.status(500).json({ message: error.message });
  }
});

// Update student in AllowedEmail collection
router.put("/students/allowed/:studentId", verifyAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { name, email, registered_id, role } = req.body;

    if (!name || !email || !registered_id) {
      return res.status(400).json({ 
        message: "Name, email, and registered ID are required" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: "Please enter a valid email address" 
      });
    }

    // Check if email already exists (excluding current record)
    const existingEmail = await AllowedEmail.findOne({ 
      email, 
      _id: { $ne: studentId } 
    });
    if (existingEmail) {
      return res.status(400).json({ 
        message: "Email already exists in allowed list" 
      });
    }

    // Check if registered_id already exists (excluding current record)
    const existingId = await AllowedEmail.findOne({ 
      registered_id, 
      _id: { $ne: studentId } 
    });
    if (existingId) {
      return res.status(400).json({ 
        message: "Registered ID already exists in allowed list" 
      });
    }

    // Check if user is already registered with different email/id
    const existingUser = await User.findOne({ 
      $or: [{ email }, { registered_id }] 
    });
    if (existingUser) {
      return res.status(400).json({ 
        message: "Student with this email or registered ID is already registered" 
      });
    }

    const updatedStudent = await AllowedEmail.findByIdAndUpdate(
      studentId,
      { name, email, registered_id, role },
      { new: true, runValidators: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({
      message: "Student updated successfully",
      student: updatedStudent
    });
  } catch (error) {
    console.error("Error updating student:", error);
    res.status(500).json({ message: error.message });
  }
});

// Remove student from AllowedEmail collection
router.delete("/students/allowed/:studentId", verifyAdmin, async (req, res) => {
  try {
    const { studentId } = req.params;
    
    const deletedStudent = await AllowedEmail.findByIdAndDelete(studentId);
    if (!deletedStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({ 
      message: "Student removed from allowed list successfully",
      deletedStudent: {
        name: deletedStudent.name,
        email: deletedStudent.email,
        registered_id: deletedStudent.registered_id
      }
    });
  } catch (error) {
    console.error("Error removing student:", error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== LEGACY ROUTES (maintained for compatibility) ====================

// Add allowed email for student registration (legacy route)
router.post("/allowed-emails", verifyAdmin, async (req, res) => {
  try {
    const { email, role = "student", name, registered_id } = req.body;

    const existingEmail = await AllowedEmail.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already in allowed list" });
    }

    const allowedEmail = new AllowedEmail({ 
      email, 
      role, 
      name: name || null, 
      registered_id: registered_id || null 
    });
    await allowedEmail.save();

    res.status(201).json({
      message: "Email added to allowed list successfully",
      allowedEmail
    });
  } catch (error) {
    console.error("Error adding allowed email:", error);
    res.status(500).json({ message: error.message });
  }
});

// Remove allowed email (legacy route)
router.delete("/allowed-emails/:emailId", verifyAdmin, async (req, res) => {
  try {
    const { emailId } = req.params;
    
    const deletedEmail = await AllowedEmail.findByIdAndDelete(emailId);
    if (!deletedEmail) {
      return res.status(404).json({ message: "Allowed email not found" });
    }

    res.json({ message: "Allowed email removed successfully" });
  } catch (error) {
    console.error("Error removing allowed email:", error);
    res.status(500).json({ message: error.message });
  }
});

export default router;