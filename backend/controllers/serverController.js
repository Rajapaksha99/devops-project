// controllers/serverController.js
import { NodeSSH } from "node-ssh";
import ServerLog from "../models/ServerLog.js";

let sessions = {}; // Keep track of SSH sessions per student

// Connect to server
export const connectToServer = async (req, res) => {
  const { userID, userName, userEmail, serverIP, username, password } = req.body;

  try {
    const ssh = new NodeSSH();

    await ssh.connect({
      host: serverIP,
      username,
      password
    });

    console.log("SSH connected");

    const log = new ServerLog({
      userID,
      userName,
      userEmail,
      serverIP,
      loginTime: new Date(),
      commands: []
    });

    await log.save();

    sessions[userID] = { ssh, logID: log._id };

    res.json({ message: "Connected", sessionID: log._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "SSH connection failed", error: err.message });
  }
};

// Execute command
export const executeCommand = async (req, res) => {
  const { userID, command } = req.body;
  const session = sessions[userID];

  if (!session) {
    return res.status(400).json({ message: "No active session" });
  }

  try {
    const result = await session.ssh.execCommand(command);

    // Save command in log
    await ServerLog.findByIdAndUpdate(session.logID, { $push: { commands: command } });

    res.json({ output: result.stdout || result.stderr });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Disconnect from server
export const disconnectFromServer = async (req, res) => {
  const { userID } = req.body;
  const session = sessions[userID];

  if (!session) {
    return res.status(400).json({ message: "No active session" });
  }

  try {
    session.ssh.dispose(); // Disconnect SSH
    await ServerLog.findByIdAndUpdate(session.logID, { logoutTime: new Date() });

    delete sessions[userID];

    res.json({ message: "Disconnected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
