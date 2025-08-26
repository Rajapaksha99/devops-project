import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";
import { FitAddon } from 'xterm-addon-fit';

const SERVER_URL = "http://localhost:5000";

// GLOBAL SINGLETON PATTERN - Prevent multiple instances
let globalTerminalInstance = null;
let globalSocketInstance = null;
let globalIsInitialized = false;
let globalFitAddon = null;
let globalInputHandler = null;
let globalKeyHandler = null;
let globalEventListenersAttached = false;

const TerminalPage = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionData, setConnectionData] = useState(null);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("initializing");
  
  // Refs that don't cause re-renders
  const terminalRef = useRef();
  const terminalInstance = useRef();
  const socketRef = useRef();
  const isInitializedRef = useRef(false);
  const connectionTimeoutRef = useRef(null);

  const getStoredUserData = useCallback(() => {
    try {
      const userData = localStorage.getItem('user');
      const token = localStorage.getItem('token');
      
      if (userData) {
        const user = JSON.parse(userData);
        return {
          token: token || '',
          userId: user.id || '',
          userEmail: user.email || '',
          userName: user.name || '',
          registeredId: user.registered_id || '',
          userRole: user.role || 'student'
        };
      }
    } catch (err) {
      console.warn("Could not retrieve stored user data:", err);
    }
    return {};
  }, []);

  const connectToSSHServer = useCallback((socketInstance, data, term) => {
    if (!socketInstance || !data || !term) {
      console.error("Missing socket instance, connection data, or terminal");
      if (term) term.write(`❌ Cannot connect: Missing connection data\r\n`);
      return;
    }

    console.log("🔗 Attempting SSH connection with data:", data);

    const sshConnectionData = {
      host: data.host,
      username: data.username,
      password: data.password,
      port: data.port || 22,
      
      user: {
        id: data.userId,
        name: data.userName,
        email: data.userEmail,
        registered_id: data.registeredId,
        role: data.userRole
      },
      
      session: {
        id: data.sessionId,
        token: data.token,
        connectionTime: data.connectionTime,
        serverName: data.serverName,
        dashboardUrl: data.dashboardUrl
      },
      
      browser: {
        userAgent: data.browserInfo || navigator.userAgent,
        windowId: window.name,
        referrer: document.referrer
      }
    };

    term.write(`🔗 Connecting to SSH server...\r\n`);
    term.write(`📡 Host: ${data.host}:${data.port || 22}\r\n`);
    term.write(`👤 User: ${data.username}\r\n`);
    

    console.log("📤 Sending SSH connection data:", sshConnectionData);

    // Send connection request - only once
    socketInstance.emit("ssh-connect", sshConnectionData);
    
    socketInstance.emit("user-activity", {
      type: 'terminal_access',
      userId: data.userId,
      userName: data.userName,
      action: 'ssh_connect_attempt',
      target: data.host,
      timestamp: new Date().toISOString(),
      sessionId: data.sessionId
    });

    // Clear any existing timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
    }

    // Set timeout warning
    connectionTimeoutRef.current = setTimeout(() => {
      term.write(`⏱️ Connection is taking longer than expected...\r\n`);
      term.write(`💡 Check if your backend server is handling SSH connections properly\r\n\r\n`);
    }, 10000);

  }, []);

  const cleanupConnection = useCallback(() => {
    console.log("🧹 GLOBAL CLEANUP: Cleaning up connection...");
    
    // Clear timeout
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    
    // Clean up global input handlers
    if (globalInputHandler) {
      console.log("🗑️ Disposing GLOBAL input handler...");
      globalInputHandler.dispose();
      globalInputHandler = null;
    }
    if (globalKeyHandler) {
      console.log("🗑️ Disposing GLOBAL key handler...");
      globalKeyHandler.dispose();
      globalKeyHandler = null;
    }
    
    // Clean up global socket
    if (globalSocketInstance) {
      console.log("🗑️ Cleaning up GLOBAL socket...");
      globalSocketInstance.removeAllListeners();
      globalSocketInstance.disconnect();
      globalSocketInstance = null;
    }
    
    // Clean up global terminal
    if (globalTerminalInstance && !globalTerminalInstance.isDisposed) {
      console.log("🗑️ Disposing GLOBAL terminal...");
      globalTerminalInstance.dispose();
      globalTerminalInstance = null;
    }
    
    // Reset global flags
    globalIsInitialized = false;
    globalFitAddon = null;
    globalEventListenersAttached = false;
    
    // Clean up session storage
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('terminal_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    console.log("✅ GLOBAL cleanup complete");
  }, []);

  const setupSocketEventListeners = useCallback((socket, term, data) => {
    // Prevent multiple event listener attachments
    if (globalEventListenersAttached) {
      console.log("🛑 Socket event listeners already attached globally, skipping...");
      return;
    }

    console.log("🎧 Setting up socket event listeners (ONCE)...");
    globalEventListenersAttached = true;

    let sshConnectedHandled = false;

    socket.on("connect", () => {
      console.log("✅ GLOBAL SOCKET: Connected to terminal server");
      setIsConnected(true);
      setConnectionStatus("connected");
      
      connectToSSHServer(socket, data, term);
    });

    socket.on("ssh-output", (outputData) => {
      if (term && !term.isDisposed) {
        term.write(outputData);
      }
    });

    socket.on("ssh-connected", (info) => {
      // PREVENT DUPLICATE SSH CONNECTED MESSAGES
      if (sshConnectedHandled) {
        console.log("⚠️ SSH connected event already handled globally, ignoring duplicate");
        return;
      }
      sshConnectedHandled = true;
      
      // Clear timeout
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      console.log("🎉 GLOBAL SSH: Connection established (ONCE ONLY)");
      setConnectionStatus("ssh-connected");
      setError("");
      term.write(`\r\n🎉 SSH CONNECTION ESTABLISHED! 🎉\r\n`);
      term.write(`✅ Connected to: ${info.host || data.host}\r\n`);
      term.write(`👤 User: ${data.userName || 'Unknown'}\r\n`);
      term.write(`🆔 ID: ${data.registeredId || 'No ID'}\r\n`);
      term.write(`⏰ Time: ${new Date().toLocaleString()}\r\n`);
      term.write(`${'='.repeat(50)}\r\n`);
      term.write(`${'='.repeat(50)}\r\n\r\n`);
    });

    socket.on("ssh-error", (errorData) => {
      const errorMsg = errorData.message || errorData;
      setConnectionStatus("error");
      setError(errorMsg);
      
      setTimeout(() => {
        if (globalSocketInstance && data) {
          connectToSSHServer(globalSocketInstance, data, term);
        }
      }, 3000);
    });

    socket.on("ssh-disconnected", () => {
      term.write("\r\n🔌 SSH connection closed\r\n");
      setConnectionStatus("disconnected");
      setIsConnected(false);
    });

    socket.on("disconnect", (reason) => {
      setIsConnected(false);
      setConnectionStatus("disconnected");
      term.write(`\r\n[Socket disconnected: ${reason}]\r\n`);
      
      if (reason !== 'io client disconnect') {
        setTimeout(() => {
          if (globalSocketInstance && !globalSocketInstance.connected) {
            term.write(`\r\n🔄 Attempting to reconnect...\r\n`);
            globalSocketInstance.connect();
          }
        }, 2000);
      }
    });

    socket.on("connect_error", (err) => {
      const errorMsg = `Connection error: ${err.message}`;
      setError(errorMsg);
      setConnectionStatus("error");
      term.write(`\r\n❌ ${errorMsg}\r\n`);
      term.write(`\r\n💡 Make sure your backend server is running on ${SERVER_URL}\r\n`);
    });
  }, [connectToSSHServer]);

  const setupTerminalInputHandlers = useCallback((term, socket) => {
    // Dispose any existing GLOBAL handlers first
    if (globalInputHandler) {
      globalInputHandler.dispose();
      globalInputHandler = null;
      console.log("🗑️ Disposed existing GLOBAL input handler");
    }
    if (globalKeyHandler) {
      globalKeyHandler.dispose();
      globalKeyHandler = null;
      console.log("🗑️ Disposed existing GLOBAL key handler");
    }

    console.log("🎯 Setting up terminal input handlers (ONCE)...");

    // GLOBAL INPUT HANDLER - Attach only once globally
    globalInputHandler = term.onData((input) => {
      console.log("🎯 GLOBAL INPUT (single handler):", JSON.stringify(input));
      if (socket && socket.connected) {
        // Send raw input without any local echo
        socket.emit("ssh-input", input);
        console.log("📤 GLOBAL SEND (single emit):", JSON.stringify(input));
      } else {
        term.write(`\r\n❌ Not connected to server. Cannot send input.\r\n`);
      }
    });

    // GLOBAL KEY HANDLER - Only for special keys like Ctrl+C
    globalKeyHandler = term.onKey(({ key, domEvent }) => {
      // Only handle Ctrl+C specifically, nothing else
      if (domEvent.ctrlKey && domEvent.key === 'c') {
        if (socket && socket.connected) {
          socket.emit("ssh-input", '\x03'); // Send interrupt signal
          console.log("📤 GLOBAL CTRL+C sent");
        }
      }
      // DON'T handle any other keys to prevent duplication
    });

    console.log("✅ Terminal input handlers set up successfully");
  }, []);

  const initializeTerminal = useCallback((data) => {
    // GLOBAL SINGLETON CHECK - Prevent multiple instances across ALL React renders
    if (globalIsInitialized) {
      console.log("🛑 GLOBAL BLOCK: Terminal already exists globally, using existing instance");
      
      // If we have existing global instances, just update refs and state
      if (globalTerminalInstance && terminalRef.current && !globalTerminalInstance.isDisposed) {
        terminalInstance.current = globalTerminalInstance;
        socketRef.current = globalSocketInstance;
        setIsConnected(!!globalSocketInstance?.connected);
        setConnectionStatus(globalSocketInstance?.connected ? "ssh-connected" : "connected");
      }
      return;
    }
    
    console.log("🚀 GLOBAL INIT: Creating SINGLE terminal instance globally");
    globalIsInitialized = true; // Set GLOBAL flag immediately
    isInitializedRef.current = true; // Set local flag too
    setConnectionStatus("connecting");
    
    // Create GLOBAL fitAddon only once
    if (!globalFitAddon) {
      globalFitAddon = new FitAddon();
    }
    
    // Initialize Terminal with DISABLED local echo
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selection: '#ffffff40',
        black: '#000000',
        red: '#e74c3c',
        green: '#2ecc71',
        yellow: '#f1c40f',
        blue: '#3498db',
        magenta: '#9b59b6',
        cyan: '#1abc9c',
        white: '#ecf0f1'
      },
      fontSize: 14,
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      rows: 30,
      cols: 120,
      scrollback: 1000,
      convertEol: true,
      disableStdin: false,
      localEcho: false // No local echo
    });

    term.loadAddon(globalFitAddon);

    if (terminalRef.current) {
      term.open(terminalRef.current);
      
      // Fit terminal after a small delay to ensure proper rendering
      setTimeout(() => {
        if (globalFitAddon && !term.isDisposed) {
          try {
            globalFitAddon.fit();
          } catch (err) {
            console.warn("Initial fit error:", err);
          }
        }
      }, 100);
      
      // Set GLOBAL references
      globalTerminalInstance = term;
      terminalInstance.current = term;
      
      
    }
    
    // Clean up existing GLOBAL socket before creating new one
    if (globalSocketInstance) {
      globalSocketInstance.removeAllListeners();
      globalSocketInstance.disconnect();
    }
    
    // Initialize Socket.IO as GLOBAL instance
    const newSocket = io(SERVER_URL, {
      query: {
        userId: data.userId || '',
        userName: data.userName || '',
        userRole: data.userRole || 'student'
      },
      timeout: 10000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'] // Ensure proper transport
    });
    
    // Set GLOBAL socket reference
    globalSocketInstance = newSocket;
    socketRef.current = newSocket;

    // Setup event listeners (only once)
    setupSocketEventListeners(newSocket, term, data);
    
    // Setup input handlers (only once)
    setupTerminalInputHandlers(term, newSocket);

    // Handle window resize - using GLOBAL ref to prevent recreation
    const handleResize = () => {
      if (term && term.element && globalFitAddon && !term.isDisposed) {
        try {
          globalFitAddon.fit();
        } catch (fitError) {
          console.warn("Fit error:", fitError);
          // Fallback resize logic
          if (terminalRef.current) {
            const cols = Math.floor(terminalRef.current.clientWidth / 9);
            const rows = Math.floor(terminalRef.current.clientHeight / 17);
            term.resize(cols, rows);
          }
        }
      }
    };
    
    window.addEventListener('resize', handleResize);

    // Return cleanup function
    return () => {
      console.log("🧹 Local cleanup function called...");
      window.removeEventListener('resize', handleResize);
      
      // Don't clean up global instances here - only in cleanupConnection
      // Just remove local references
      terminalInstance.current = null;
      socketRef.current = null;
    };
  }, [setupSocketEventListeners, setupTerminalInputHandlers]);

  const initializeConnection = useCallback(() => {
    // Prevent multiple initializations
    if (isInitializedRef.current) {
      console.log("Connection already initialized, skipping...");
      return;
    }
    
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let data = null;

      // Check for sessionKey method first
      const sessionKey = urlParams.get('sessionKey');
      if (sessionKey) {
        const sessionData = sessionStorage.getItem(sessionKey);
        if (sessionData) {
          data = JSON.parse(sessionData);
          sessionStorage.removeItem(sessionKey);
        }
      }

      // Fallback to direct URL data
      if (!data) {
        const urlData = urlParams.get('data') || urlParams.get('fallbackData');
        if (urlData) {
          data = JSON.parse(decodeURIComponent(urlData));
        }
      }

      // Old format compatibility
      if (!data) {
        const host = urlParams.get('host');
        const username = urlParams.get('username');
        const password = urlParams.get('password');
        const serverName = urlParams.get('serverName');
        const token = urlParams.get('token');
        const userId = urlParams.get('userId');

        if (host && username && password) {
          data = {
            host,
            username,
            password,
            serverName,
            token,
            userId,
            ...getStoredUserData()
          };
        }
      }

      // SessionStorage fallback
      if (!data) {
        const stored = sessionStorage.getItem('terminalConnection');
        if (stored) {
          data = JSON.parse(stored);
        }
      }

      if (data) {
        console.log("Setting connection data:", data);
        setConnectionData(data);
      } else {
        setError("No connection data provided. Please return to the dashboard and try again.");
      }
    } catch (err) {
      console.error("Error initializing connection:", err);
      setError("Failed to initialize connection data");
    }
  }, [getStoredUserData]);

  // Separate useEffect for initial connection data loading - NO DEPENDENCIES
  useEffect(() => {
    if (!isInitializedRef.current) {
      console.log("🔄 Loading initial connection data (ONCE)...");
      initializeConnection();
    }
  }, []); // COMPLETELY EMPTY - run only once on mount

  // Separate useEffect for terminal initialization - NO DEPENDENCIES  
  useEffect(() => {
    if (connectionData && !globalIsInitialized) {
      console.log("🚀 GLOBAL CHECK: Initializing terminal with connection data (ONCE)...");
      const cleanup = initializeTerminal(connectionData);
      
      return cleanup;
    } else if (connectionData && globalIsInitialized) {
      console.log("🔄 GLOBAL EXISTS: Connecting to existing terminal instance");
      // Connect to existing global terminal
      if (globalTerminalInstance && terminalRef.current && !globalTerminalInstance.isDisposed) {
        try {
          globalTerminalInstance.open(terminalRef.current);
          terminalInstance.current = globalTerminalInstance;
          socketRef.current = globalSocketInstance;
          setIsConnected(!!globalSocketInstance?.connected);
          setConnectionStatus(globalSocketInstance?.connected ? "ssh-connected" : "connected");
        } catch (err) {
          console.error("Error reconnecting to existing terminal:", err);
        }
      }
    }
  }, [connectionData, initializeTerminal]);

  // Handle postMessage communication
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'TERMINAL_CONNECTION_DATA') {
        if (!isInitializedRef.current) {
          setConnectionData(event.data.data);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("Component unmounting, cleaning up...");
      cleanupConnection();
    };
  }, [cleanupConnection]);

  const handleDisconnect = useCallback(() => {
    if (globalSocketInstance) {
      globalSocketInstance.emit("user-disconnect", {
        userId: connectionData?.userId,
        userName: connectionData?.userName,
        sessionId: connectionData?.sessionId,
        disconnectTime: new Date().toISOString(),
        disconnectReason: 'user_initiated'
      });
      
      globalSocketInstance.disconnect();
    }
    
    cleanupConnection();
    window.close();
  }, [connectionData, cleanupConnection]);

  const handleReconnect = useCallback(() => {
    if (connectionData) {
      console.log("🔄 Starting reconnection process...");
      setError("");
      setConnectionStatus("reconnecting");
      
      // CRITICAL: Clean up ALL global handlers first
      if (globalInputHandler) {
        globalInputHandler.dispose();
        globalInputHandler = null;
        console.log("✅ Input handler disposed for reconnect");
      }
      if (globalKeyHandler) {
        globalKeyHandler.dispose();
        globalKeyHandler = null;
        console.log("✅ Key handler disposed for reconnect");
      }
      
      // Reset initialization flags BEFORE cleanup
      globalIsInitialized = false;
      globalEventListenersAttached = false;
      isInitializedRef.current = false;
      
      if (globalTerminalInstance && !globalTerminalInstance.isDisposed) {
        globalTerminalInstance.clear();
        globalTerminalInstance.write("🔄 Reconnecting...\r\n");
      }
      
      // Clean up existing connection
      if (globalSocketInstance) {
        globalSocketInstance.removeAllListeners();
        globalSocketInstance.disconnect();
        globalSocketInstance = null;
      }
      
      if (globalTerminalInstance) {
        globalTerminalInstance.dispose();
        globalTerminalInstance = null;
      }
      
      // Reinitialize after cleanup with delay
      setTimeout(() => {
        console.log("🔄 Reinitializing terminal after cleanup...");
        initializeTerminal(connectionData);
      }, 1000);
    }
  }, [connectionData, initializeTerminal]);

  const handleNewSession = useCallback(() => {
    if (globalTerminalInstance && !globalTerminalInstance.isDisposed) {
      globalTerminalInstance.clear();
    }
    if (globalSocketInstance && connectionData) {
      const newSessionData = {
        ...connectionData,
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        connectionTime: new Date().toISOString()
      };
      setConnectionData(newSessionData);
      connectToSSHServer(globalSocketInstance, newSessionData, globalTerminalInstance);
    }
  }, [connectionData, connectToSSHServer]);

  const handleNewTerminal = useCallback(() => {
    handleNewSession();
  }, [handleNewSession]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
      case "ssh-connected":
        return "#2ecc71";
      case "connecting":
      case "reconnecting":
        return "#f39c12";
      case "error":
        return "#e74c3c";
      default:
        return "#95a5a6";
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case "initializing":
        return "Initializing...";
      case "connecting":
        return "Connecting...";
      case "connected":
        return "Socket Connected";
      case "ssh-connected":
        return "SSH Connected";
      case "reconnecting":
        return "Reconnecting...";
      case "disconnected":
        return "Disconnected";
      case "error":
        return "Connection Error";
      default:
        return "Unknown";
    }
  };

  const getUserDisplayInfo = () => {
    if (!connectionData) return { name: 'Unknown', id: 'N/A', email: 'N/A' };
    
    if (connectionData.userName) {
      return {
        name: connectionData.userName,
        id: connectionData.registeredId || 'N/A',
        email: connectionData.userEmail || 'N/A',
        role: connectionData.userRole || 'student'
      };
    }
    
    if (connectionData.user_data) {
      return {
        name: connectionData.user_data.name || 'Unknown',
        id: connectionData.user_data.registered_id || 'N/A',
        email: connectionData.user_data.email || 'N/A',
        role: connectionData.user_data.role || 'student'
      };
    }
    
    return { name: 'Unknown', id: 'N/A', email: 'N/A', role: 'student' };
  };

  if (error && !connectionData) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#2c3e50',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          backgroundColor: '#34495e',
          borderRadius: '8px',
          maxWidth: '500px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⚠️</div>
          <h2 style={{ margin: '0 0 15px 0' }}>Terminal Connection Error</h2>
          <p style={{ margin: '0 0 20px 0', color: '#bdc3c7' }}>{error}</p>
          <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#95a5a6' }}>
            Please return to the dashboard and try connecting again.
          </p>
          <button 
            onClick={() => window.close()}
            style={{
              padding: '10px 20px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  if (!connectionData) {
    return (
      <div style={{ 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#2c3e50',
        color: 'white',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          backgroundColor: '#34495e',
          borderRadius: '8px',
          maxWidth: '500px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔄</div>
          <h2 style={{ margin: '0 0 15px 0' }}>Loading Terminal...</h2>
          <p style={{ margin: '0 0 20px 0', color: '#bdc3c7' }}>Initializing connection data...</p>
          <div style={{ marginTop: '20px' }}>
            <button 
              onClick={handleReconnect}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              🔄 Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const userInfo = getUserDisplayInfo();

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#2c3e50' }}>
      {/* Enhanced Header with User Info */}
      <div style={{ 
        padding: '12px 20px', 
        backgroundColor: '#34495e', 
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid #2c3e50',
        minHeight: '60px'
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
              🖥️ {connectionData?.serverName || connectionData?.host || "Terminal"}
            </h3>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              padding: '4px 8px',
              backgroundColor: getStatusColor(),
              borderRadius: '12px',
              fontSize: '12px'
            }}>
              <div style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: 'white' 
              }}></div>
              {getStatusText()}
            </div>
          </div>
          
          <div style={{ fontSize: '13px', color: '#bdc3c7', marginTop: '4px' }}>
            👤 {userInfo.name} 
            {userInfo.id !== 'N/A' && ` (ID: ${userInfo.id})`}
            {userInfo.email !== 'N/A' && ` | 📧 ${userInfo.email}`}
            {connectionData && ` | 🔗 ${connectionData.username}@${connectionData.host}`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {(connectionStatus === "error" || connectionStatus === "disconnected") && (
            <button 
              onClick={handleReconnect}
              style={{
                padding: '6px 12px',
                backgroundColor: '#f39c12',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              🔄 Reconnect
            </button>
          )}
          
          <button 
            onClick={handleNewTerminal}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            🆕 New Session
          </button>
          
          <button 
            onClick={handleDisconnect}
            style={{
              padding: '6px 12px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            ❌ Disconnect & Close
          </button>
        </div>
      </div>

      {/* Connection Info Bar */}
      {connectionData && (
        <div style={{ 
          padding: '8px 20px', 
          backgroundColor: '#2c3e50', 
          color: '#ecf0f1',
          fontSize: '12px',
          borderBottom: '1px solid #34495e'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              🌐 Server: {connectionData.host} | 
              👥 Role: {userInfo.role} | 
              🔑 Session: {connectionData.sessionId?.substr(-8) || 'N/A'}
            </div>
            <div>
              {connectionData.connectionTime && (
                <>Connected: {new Date(connectionData.connectionTime).toLocaleTimeString()}</>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Debug Info Bar */}
      <div style={{ 
        padding: '4px 20px', 
        backgroundColor: '#1a252f', 
        color: '#95a5a6',
        fontSize: '11px',
        borderBottom: '1px solid #34495e'
      }}>
        🔍 Debug: Socket URL: {SERVER_URL} | Status: {connectionStatus} | 
        Connected: {isConnected ? 'Yes' : 'No'} | 
        GLOBAL Instance: {globalIsInitialized ? 'ACTIVE' : 'NONE'} | 
        Event Listeners: {globalEventListenersAttached ? 'ATTACHED' : 'NONE'} | 
        Input Handler: {globalInputHandler ? 'ACTIVE' : 'NONE'} |
        {error && ` Error: ${error}`}
      </div>

      {/* Terminal Container */}
      <div 
        ref={terminalRef} 
        style={{ 
          flex: 1, 
          padding: '10px',
          backgroundColor: '#000000',
          overflow: 'hidden',
          border: '1px solid #34495e',
          margin: '5px'
        }} 
      />

      {/* Status Footer */}
      <div style={{ 
        padding: '8px 20px', 
        backgroundColor: '#34495e', 
        color: '#bdc3c7',
        fontSize: '11px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          {error ? (
            <span style={{ color: '#e74c3c' }}>❌ Error: {error}</span>
          ) : (
            <span>
              Terminal ready | Use Ctrl+C to interrupt | Type 'exit' to close SSH session | No Local Echo
            </span>
          )}
        </div>
        <div>
          {userInfo.name !== 'Unknown' && `Logged in as: ${userInfo.name}`}
        </div>
      </div>
    </div>
  );
};

export default TerminalPage;