// populateServers.js - Script to populate servers in database
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Server schema (same as your Serverip model)
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

serverSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

const Serverip = mongoose.model("Serverip", serverSchema);

// Sample servers data - replace with your actual server IPs
const serversData = [
  {
    name: "Development Server 1",
    ip: "172.184.216.215",
    port: 22,
    description: "Main development server for students",
    status: "active",
    max_connections: 50
  },
  {
    name: "Development Server 2", 
    ip: "20.245.171.127",
    port: 22,
    description: "Secondary development server",
    status: "active",
    max_connections: 50
  },
  {
    name: "Development Server 3",
    ip: "20.245.171.126", 
    port: 22,
    description: "Testing server for advanced students",
    status: "active",
    max_connections: 30
  },
  {
    name: "Development Server 4",
    ip: "20.245.171.128",
    port: 22, 
    description: "Backup server",
    status: "active",
    max_connections: 25
  },
  {
    name: "Maintenance Server",
    ip: "192.168.1.100",
    port: 22,
    description: "Server under maintenance",
    status: "maintenance", 
    max_connections: 10
  }
];

async function populateServers() {
  try {
    // Connect to MongoDB
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log("MongoDB connected successfully!");

    // Clear existing servers (optional - remove this if you want to keep existing data)
    console.log("Clearing existing servers...");
    await Serverip.deleteMany({});
    console.log("Existing servers cleared.");

    // Insert new servers
    console.log("Adding new servers...");
    const insertedServers = await Serverip.insertMany(serversData);
    
    console.log(`Successfully added ${insertedServers.length} servers:`);
    insertedServers.forEach(server => {
      console.log(`- ${server.name} (${server.ip}) - Status: ${server.status}`);
    });

    // Show current server count and status distribution
    const totalServers = await Serverip.countDocuments();
    const activeServers = await Serverip.countDocuments({ status: "active" });
    const maintenanceServers = await Serverip.countDocuments({ status: "maintenance" });
    const inactiveServers = await Serverip.countDocuments({ status: "inactive" });

    console.log("\n=== Database Summary ===");
    console.log(`Total Servers: ${totalServers}`);
    console.log(`Active Servers: ${activeServers}`);
    console.log(`Maintenance Servers: ${maintenanceServers}`);
    console.log(`Inactive Servers: ${inactiveServers}`);

    // Test API endpoint format
    console.log("\n=== Testing API Response Format ===");
    const servers = await Serverip.find({ status: "active" })
      .select('name ip port description status max_connections created_at updated_at')
      .sort({ name: 1 });
    
    console.log("API Response would be:");
    console.log(JSON.stringify({
      success: true,
      servers: servers
    }, null, 2));

  } catch (error) {
    console.error("Error populating servers:", error);
    
    if (error.code === 11000) {
      console.log("Duplicate IP address detected. Each server must have a unique IP.");
    }
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log("\nMongoDB connection closed.");
    process.exit(0);
  }
}

// Run the script
console.log("Starting server population script...");
console.log("MongoDB URL:", process.env.MONGODB_URL ? "✓ Found" : "✗ Missing");

if (!process.env.MONGODB_URL) {
  console.error("Error: MONGODB_URL not found in environment variables!");
  console.log("Make sure your .env file contains: MONGODB_URL=your_mongodb_connection_string");
  process.exit(1);
}

populateServers();