import React, { useState, useEffect } from "react";

const StudentDashboard = () => {
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [user, setUser] = useState(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Get user data from localStorage on component mount
    const userData = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
      } catch (err) {
        console.error('Error parsing user data:', err);
        handleLogout();
        return;
      }
    }

    // Redirect to login if no user data found
    if (!userData || !token) {
      window.location.href = '/login';
      return;
    }

    // Fetch servers from API
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoadingServers(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      
      // Determine the correct API base URL
      const getApiBaseUrl = () => {
        // If in development, use localhost:5000
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
          return 'http://localhost:5000';
        }
        // If in production, assume same domain different port or same domain
        return window.location.origin.replace(':3000', ':5000');
      };

      const API_BASE_URL = getApiBaseUrl();
      
      // Try different possible API endpoints
      const apiEndpoints = [
        `${API_BASE_URL}/api/servers`,
        '/api/servers', // Fallback for proxy setup
      ];
      
      let response = null;
      let lastError = null;
      
      for (const endpoint of apiEndpoints) {
        try {
          console.log(`Trying API endpoint: ${endpoint}`);
          
          response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          // Check if response is HTML (common error)
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            throw new Error(`Received HTML instead of JSON from ${endpoint}. Server might not be running on correct port.`);
          }
          
          if (response.ok) {
            break; // Success, exit loop
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
        } catch (err) {
          console.warn(`Failed to fetch from ${endpoint}:`, err.message);
          lastError = err;
          response = null;
        }
      }
      
      if (!response) {
        throw lastError || new Error('All API endpoints failed');
      }

      if (response.status === 401) {
        // Token expired or invalid
        handleLogout();
        return;
      }

      const data = await response.json();
      console.log('Received server data:', data);
      
      if (data.success && data.servers && data.servers.length > 0) {
        // Filter only active servers for students
        const activeServers = data.servers.filter(server => server.status === 'active');
        console.log('Active servers found:', activeServers);
        
        setServers(activeServers);
        setSelectedServer(activeServers[0] || null); // Select first active server by default
        
        if (activeServers.length === 0) {
          setError("No active servers available in database");
        }
      } else {
        setError("No servers found in database");
        console.warn('No servers returned from API:', data);
      }
    } catch (error) {
      console.error('Error fetching servers:', error);
      
      // More specific error messages
      let errorMessage = error.message;
      if (errorMessage.includes('fetch')) {
        errorMessage = 'Cannot connect to server. Please check if the backend server is running on port 5000.';
      } else if (errorMessage.includes('HTML')) {
        errorMessage = 'Server returned HTML instead of JSON. Check your API routes configuration.';
      } else if (errorMessage.includes('JSON')) {
        errorMessage = 'Invalid JSON response from server. Check server logs for errors.';
      }
      
      setError(`API Error: ${errorMessage}`);
      
      // Remove fallback servers - force user to fix API issue
      setServers([]);
      setSelectedServer(null);
      
    } finally {
      setLoadingServers(false);
    }
  };

  const handleConnect = () => {
    if (!user || !username || !password) {
      alert("Please enter both username and password");
      return;
    }

    if (!selectedServer) {
      alert("Please select a server");
      return;
    }

    setIsConnecting(true);

    try {
      const token = localStorage.getItem('token');
      
      // Enhanced connection data matching server.js expectations
      const connectionData = {
        // Server connection details
        host: selectedServer.ip,
        username: username,
        password: password,
        serverName: selectedServer.name,
        port: selectedServer.port || 22,
        
        // User authentication and identification (matching server.js structure)
        token: token || '',
        userId: user.id || user._id || '',
        userEmail: user.email || '',
        userName: user.name || '',
        registeredId: user.registered_id || '',
        userRole: user.role || 'student',
        
        // Legacy support for different data structures
        user: {
          id: user.id || user._id,
          name: user.name,
          email: user.email,
          registered_id: user.registered_id,
          role: user.role || 'student'
        },
        
        // Session metadata
        connectionTime: new Date().toISOString(),
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        
        // Additional context
        dashboardUrl: window.location.origin,
        browserInfo: navigator.userAgent,
        serverId: selectedServer._id || selectedServer.id
      };

      // Store in sessionStorage for secure data transfer
      const sessionKey = `terminal_${selectedServer.ip}_${Date.now()}`;
      sessionStorage.setItem(sessionKey, JSON.stringify(connectionData));
      
      // Create URL parameters
      const urlParams = new URLSearchParams({
        sessionKey: sessionKey,
        serverName: selectedServer.name,
        serverIp: selectedServer.ip
      });

      // Create unique window name to allow multiple terminals
      const windowName = `terminal_${selectedServer.name.replace(/\s+/g, '_')}_${user.id || user._id}_${Date.now()}`;
      
      // Open new window
      const newWindow = window.open(
        `/terminal?${urlParams.toString()}`, 
        windowName,
        'width=1200,height=800,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,status=no'
      );

      // Check if popup was blocked
      if (!newWindow) {
        alert("Popup blocked! Please allow popups for this site and try again.");
        setIsConnecting(false);
        return;
      }

      // Send additional data via postMessage after window loads
      const sendDataToTerminal = () => {
        try {
          newWindow.postMessage({
            type: 'TERMINAL_CONNECTION_DATA',
            data: connectionData
          }, window.location.origin);
        } catch (error) {
          console.warn('Could not send data via postMessage:', error);
        }
      };

      // Wait for the terminal window to load, then send data
      setTimeout(sendDataToTerminal, 1000);
      
      // Focus the new window
      newWindow.focus();

      // Cleanup: Clear sensitive data after connection
      setTimeout(() => {
        setPassword("");
        setIsConnecting(false);
      }, 2000);

      // Track the connection
      console.log(`Terminal connection opened for ${user.name} to ${selectedServer.name} (${selectedServer.ip})`);

    } catch (error) {
      console.error('Connection error:', error);
      alert('Failed to establish connection. Please try again.');
      setIsConnecting(false);
    }
  };

  const handleLogout = () => {
    // Clear all stored data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Clear any terminal session data
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('terminal_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    window.location.href = '/login';
  };

  // Show loading state while user data is being retrieved
  if (!user) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            fontSize: '18px', 
            marginBottom: '10px',
            color: '#495057'
          }}>
            Loading Dashboard...
          </div>
          <div style={{ color: '#6c757d' }}>Please wait</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '20px auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '30px',
        paddingBottom: '15px',
        borderBottom: '2px solid #dee2e6'
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#2c3e50' }}>Student Dashboard</h2>
          <p style={{ margin: '5px 0 0 0', color: '#28a745', fontWeight: 'bold' }}>
            Welcome, {user.name || 'Student'}
          </p>
          {user.registered_id && (
            <p style={{ margin: '2px 0 0 0', color: '#6f42c1', fontSize: '12px' }}>
              Student ID: {user.registered_id}
            </p>
          )}
          {user.email && (
            <p style={{ margin: '2px 0 0 0', color: '#6c757d', fontSize: '12px' }}>
              Email: {user.email}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={fetchServers}
            disabled={loadingServers}
            style={{
              padding: '8px 16px',
              backgroundColor: loadingServers ? '#6c757d' : '#17a2b8',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loadingServers ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              transition: 'background-color 0.3s ease'
            }}
            onMouseOver={(e) => !loadingServers && (e.target.style.backgroundColor = '#138496')}
            onMouseOut={(e) => !loadingServers && (e.target.style.backgroundColor = '#17a2b8')}
          >
            {loadingServers ? 'Refreshing...' : '🔄 Refresh Servers'}
          </button>
          <button 
            onClick={handleLogout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'background-color 0.3s ease'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#c82333'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#dc3545'}
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '4px',
          marginBottom: '20px',
          color: '#721c24'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>⚠️ Connection Error</div>
          <div style={{ marginBottom: '10px' }}>{error}</div>
          
          {error.includes('Cannot connect to server') && (
            <div style={{ fontSize: '12px', backgroundColor: '#f5c6cb', padding: '8px', borderRadius: '3px', marginTop: '10px' }}>
              <strong>Troubleshooting Steps:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '15px' }}>
                <li>Make sure your backend server is running: <code>node server.js</code></li>
                <li>Check if server is running on port 5000</li>
                <li>Verify MongoDB is connected</li>
                <li>Check server console for errors</li>
              </ul>
            </div>
          )}
          
          {error.includes('HTML instead of JSON') && (
            <div style={{ fontSize: '12px', backgroundColor: '#f5c6cb', padding: '8px', borderRadius: '3px', marginTop: '10px' }}>
              <strong>Server Configuration Issue:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '15px' }}>
                <li>API routes may not be properly configured</li>
                <li>Check that server.js includes: <code>app.use("/api/auth", authRoutes);</code></li>
                <li>Verify the server is not serving HTML for API routes</li>
              </ul>
            </div>
          )}
          
          {error.includes('No servers found') && (
            <div style={{ fontSize: '12px', backgroundColor: '#f5c6cb', padding: '8px', borderRadius: '3px', marginTop: '10px' }}>
              <strong>Database Issue:</strong>
              <ul style={{ margin: '5px 0', paddingLeft: '15px' }}>
                
                <li>Add servers using admin panel</li>
             
              </ul>
            </div>
          )}
        </div>
      )}
      
      {/* Server Selection */}
      <div style={{ marginBottom: '25px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: 'bold',
          color: '#495057'
        }}>
          Select Server to Connect with it's terminal:
        </label>
        {loadingServers ? (
          <div style={{
            padding: '12px',
            backgroundColor: '#e9ecef',
            border: '2px solid #ced4da',
            borderRadius: '6px',
            textAlign: 'center',
            color: '#495057'
          }}>
            🔄 Loading available servers...
          </div>
        ) : (
          <select
            value={selectedServer ? selectedServer.ip : ''}
            onChange={(e) => {
              const server = servers.find((s) => s.ip === e.target.value);
              setSelectedServer(server);
            }}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '2px solid #ced4da',
              borderRadius: '6px',
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            <option value="" disabled>Choose a server...</option>
{servers.map((server) => (
  <option key={server._id || server.ip} value={server.ip}>
    {server.name} - {server.ip} 
    {server.status !== 'active' ? ` (${server.status})` : ''}
  </option>
))}

          </select>
        )}
      </div>

      {/* SSH Credentials */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '20px', 
        marginBottom: '25px' 
      }}>
        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: 'bold',
            color: '#495057'
          }}>
            Server Username:
          </label>
          <input
            type="text"
            placeholder="Enter server username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '2px solid #ced4da',
              borderRadius: '6px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: 'bold',
            color: '#495057'
          }}>
            Server Password:
          </label>
          <input
            type="password"
            placeholder="Enter server password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleConnect()}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '2px solid #ced4da',
              borderRadius: '6px',
              boxSizing: 'border-box'
            }}
          />
        </div>
      </div>

      {/* Connect Button */}
      <button 
        onClick={handleConnect}
        disabled={isConnecting || !username || !password || !selectedServer || loadingServers}
        style={{
          width: '100%',
          padding: '15px',
          fontSize: '18px',
          fontWeight: 'bold',
          backgroundColor: (isConnecting || !username || !password || !selectedServer || loadingServers) ? '#6c757d' : '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: (isConnecting || !username || !password || !selectedServer || loadingServers) ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.3s ease',
          marginBottom: '25px'
        }}
        onMouseOver={(e) => {
          if (!e.target.disabled) {
            e.target.style.backgroundColor = '#218838';
          }
        }}
        onMouseOut={(e) => {
          if (!e.target.disabled) {
            e.target.style.backgroundColor = '#28a745';
          }
        }}
      >
        {isConnecting ? 'Opening Terminal...' : ' Connect to Server Terminal'}
      </button>

      {/* Server Info Card */}
      {selectedServer && (
        <div style={{ 
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '6px',
          border: '1px solid #dee2e6',
          marginBottom: '20px'
        }}>
          <h4 style={{ margin: '0 0 15px 0', color: '#495057' }}>
            📊 Selected Server Information
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <strong>Server Name:</strong> {selectedServer.name}
            </div>
            <div>
              <strong>IP Address:</strong> {selectedServer.ip}
            </div>
            <div>
              <strong>Port:</strong> {selectedServer.port || 22}
            </div>
            <div>
              <strong>Status:</strong> 
              <span style={{ 
                color: selectedServer.status === 'active' ? '#28a745' : 
                      selectedServer.status === 'maintenance' ? '#ffc107' : '#dc3545',
                marginLeft: '5px',
                textTransform: 'capitalize',
                fontWeight: 'bold'
              }}>
                ● {selectedServer.status || 'Active'}
              </span>
            </div>
            <div>
              <strong>Student:</strong> {user.name}
            </div>
            <div>
              <strong>Role:</strong> <span style={{ textTransform: 'capitalize', color: '#6f42c1' }}>{user.role || 'Student'}</span>
            </div>
            {selectedServer.max_connections && (
              <div>
                <strong>Max Connections:</strong> {selectedServer.max_connections}
              </div>
            )}
            {selectedServer.created_at && (
              <div>
                <strong>Server Created:</strong> {new Date(selectedServer.created_at).toLocaleDateString()}
              </div>
            )}
          </div>
          {selectedServer.description && (
            <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <strong>Description:</strong> {selectedServer.description}
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div style={{ 
        padding: '20px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '6px',
        border: '1px solid #bbdefb',
        marginBottom: '15px'
      }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#1976d2' }}>📋 Connection Instructions:</h4>
        <ol style={{ margin: 0, paddingLeft: '20px', color: '#495057' }}>
          <li style={{ marginBottom: '8px' }}>
            Select your assigned server from the dropdown menu above
          </li>
          <li style={{ marginBottom: '8px' }}>
            Enter your SSH credentials (username and password for the server)
          </li>
          <li style={{ marginBottom: '8px' }}>
            Click "Connect to Server Terminal" to open a new window with terminal access
          </li>
          <li style={{ marginBottom: '8px' }}>
            <strong>Important:</strong> Make sure to allow popups for this website
          </li>
          <li>
            The terminal will automatically authenticate using your student profile data
          </li>
        </ol>
      </div>

      {/* Enhanced Security Warning */}
      <div style={{ 
        padding: '15px', 
        backgroundColor: '#fff3cd', 
        borderRadius: '6px',
        border: '1px solid #ffeaa7'
      }}>
        <p style={{ margin: 0, color: '#856404', fontSize: '14px' }}>
          🔐 <strong>Security Notice:</strong> Always log out when finished and never share your SSH credentials. 
          Your session is tracked and logged for security purposes. Close the terminal window when done to end your session properly.
        </p>
      </div>
    </div>
  );
};

export default StudentDashboard;