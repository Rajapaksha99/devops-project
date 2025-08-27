import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

const SERVER_URL = "http://172.184.216.215:5000";

const TerminalPage = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState(null);
  const terminalRef = useRef();
  const termRef = useRef();

  useEffect(() => {
    // Get connection info from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const host = urlParams.get('host');
    const username = urlParams.get('username');
    const password = urlParams.get('password');
    const serverName = urlParams.get('serverName');

    if (host && username && password) {
      setConnectionInfo({ host, username, password, serverName });
    } else {
      // If no params, try to get from sessionStorage (fallback)
      const stored = sessionStorage.getItem('terminalConnection');
      if (stored) {
        setConnectionInfo(JSON.parse(stored));
      }
    }
  }, []);

  useEffect(() => {
    if (!connectionInfo) return;

    const newSocket = io(SERVER_URL);
    setSocket(newSocket);
    
    const term = new Terminal({
      rows: 30,
      cols: 120,
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff'
      }
    });
    
    term.open(terminalRef.current);
    termRef.current = term;

    // Auto-connect when component mounts
    newSocket.emit("ssh-connect", {
      host: connectionInfo.host,
      username: connectionInfo.username,
      password: connectionInfo.password,
    });

    newSocket.on("ssh-output", (data) => {
      term.write(data);
      if (data.includes(`Connected to ${connectionInfo.host}`)) {
        setIsConnected(true);
      }
    });

    term.onData((input) => {
      newSocket.emit("ssh-input", input);
    });

    // Handle window close
    const handleBeforeUnload = () => {
      newSocket.disconnect();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      newSocket.disconnect();
      term.dispose();
    };
  }, [connectionInfo]);

  const handleDisconnect = () => {
    if (socket) {
      socket.disconnect();
      setIsConnected(false);
    }
    window.close();
  };

  if (!connectionInfo) {
    return (
      <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h2>Terminal Access</h2>
        <p>No connection information provided. Please return to the dashboard and try again.</p>
        <button onClick={() => window.close()}>Close Window</button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ 
        padding: '10px 20px', 
        backgroundColor: '#2c3e50', 
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h3 style={{ margin: 0 }}>
            Terminal - {connectionInfo.serverName || connectionInfo.host}
          </h3>
          <small>
            Connected as {connectionInfo.username}@{connectionInfo.host}
            {isConnected && <span style={{ color: '#2ecc71' }}> ● Connected</span>}
          </small>
        </div>
        <button 
          onClick={handleDisconnect}
          style={{
            padding: '5px 15px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Disconnect & Close
        </button>
      </div>

      {/* Terminal */}
      <div 
        ref={terminalRef} 
        style={{ 
          flex: 1, 
          padding: '10px',
          backgroundColor: '#000000'
        }} 
      />
    </div>
  );
};

export default TerminalPage;