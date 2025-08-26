import React, { useState, useEffect, useCallback } from 'react';
import StudentManagement from './StudentManagement';
import { 
  Users, 
  Server, 
  Terminal, 
  Clock, 
  Activity, 
  Eye, 
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  BarChart3,
  User,
  ArrowLeft,
  Monitor,
  Command as CommandIcon,
  Calendar,
  Globe,
  Shield,
  Zap,
  Plus,
  X,
  Trash2
} from 'lucide-react';

import './AdminDashboard.css';

const AdminDashboard = () => {
  const [dashboardStats, setDashboardStats] = useState(null);
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [serverSessions, setServerSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentView, setCurrentView] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [serverIPs, setServerIPs] = useState([]);
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [deletingServer, setDeletingServer] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  
  const [newServerData, setNewServerData] = useState({
    name: '',
    ip: '',
    port: 22,
    description: '',
    max_connections: 100
  });

  const API_BASE = 'http://localhost:5000/api';
  
  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  });

  // Fetch dashboard statistics with server filtering
  const fetchDashboardStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/dashboard/stats`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setDashboardStats(data);
      }
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    }
  }, []);

  // Fetch servers list
  const fetchServers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/servers`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setServers(data);
      }
    } catch (err) {
      console.error('Error fetching servers:', err);
    }
  }, []);

  // Fetch server IPs list
  const fetchServerIPs = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/servers/all`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setServerIPs(data.servers);
      }
    } catch (err) {
      console.error('Error fetching server IPs:', err);
    }
  }, []);

  // Fetch server sessions with validation
  const fetchServerSessions = useCallback(async (serverIp) => {
    // Check if server still exists in our serverIPs list
    const serverExists = serverIPs.some(server => server.ip === serverIp);
    if (!serverExists) {
      setError('Server no longer exists. Please refresh the page.');
      setCurrentView('overview');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/servers/${serverIp}/sessions?limit=10`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setServerSessions(data.sessions);
        setSelectedServer(serverIp);
        setCurrentView('servers');
      } else {
        // If server data not found, redirect to overview
        setError('Server data not available');
        setCurrentView('overview');
      }
    } catch (err) {
      setError('Error fetching server sessions');
      console.error('Error:', err);
      setCurrentView('overview');
    } finally {
      setLoading(false);
    }
  }, [serverIPs]);

  // Fetch session details
  const fetchSessionDetails = useCallback(async (sessionId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/admin/sessions/${sessionId}`, {
        headers: getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setSessionDetails(data);
        setSelectedSession(sessionId);
        setCurrentView('session-details');
      }
    } catch (err) {
      setError('Error fetching session details');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add new server
  const addServer = async () => {
    try {
      if (!newServerData.name || !newServerData.ip) {
        setError('Server name and IP address are required');
        return;
      }

      const response = await fetch(`${API_BASE}/servers`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newServerData)
      });

      const data = await response.json();
      
      if (response.ok) {
        setServerIPs(prev => [...prev, data.server]);
        setNewServerData({ name: '', ip: '', port: 22, description: '', max_connections: 100 });
        setShowAddServerModal(false);
        setError('');
      } else {
        setError(data.error || 'Failed to add server');
      }
    } catch (err) {
      setError('Network error while adding server');
      console.error('Error adding server:', err);
    }
  };

  // Delete server with cascade deletion of related data
  const deleteServer = async (serverId, serverIp) => {
    const serverToDelete = serverIPs.find(s => s._id === serverId);
    const serverName = serverToDelete ? serverToDelete.name : serverIp;
    
    if (!window.confirm(`Are you sure you want to delete "${serverName}"?\n\nThis will permanently delete:\n• The server configuration\n• All session history for this server\n• All commands executed on this server\n\nThis action cannot be undone.`)) {
      return;
    }

    setDeletingServer(serverId);
    setError('');

    try {
      // First, delete the server and all related data with cascade delete
      const response = await fetch(`${API_BASE}/servers/${serverId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ cascade: true }) // Add cascade parameter
      });

      const data = await response.json();

      if (response.ok) {
        // Update local state
        setServerIPs(prev => prev.filter(server => server._id !== serverId));
        
        // If we're currently viewing sessions for this server, go back to overview
        if (selectedServer === serverIp) {
          setSelectedServer(null);
          setServerSessions([]);
          setCurrentView('overview');
        }
        
        // If we're viewing session details for a session from this server, go back to overview
        if (sessionDetails && sessionDetails.server_info && sessionDetails.server_info.ip === serverIp) {
          setSessionDetails(null);
          setSelectedSession(null);
          setCurrentView('overview');
        }
        
        // Refresh all data to ensure UI is consistent
        await Promise.all([
          fetchDashboardStats(),
          fetchServers()
        ]);

        // Show success message
        setError('');
        
      } else {
        setError(data.error || 'Failed to delete server');
      }
    } catch (err) {
      setError('Network error while deleting server');
      console.error('Error deleting server:', err);
    } finally {
      setDeletingServer(null);
    }
  };

  // Update server status
  const updateServerStatus = async (serverId, newStatus) => {
    try {
      const response = await fetch(`${API_BASE}/servers/${serverId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        const data = await response.json();
        setServerIPs(prev => prev.map(server => 
          server._id === serverId ? data.server : server
        ));
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update server status');
      }
    } catch (err) {
      setError('Network error while updating server');
      console.error('Error updating server:', err);
    }
  };

  // Get admin user info from localStorage
  useEffect(() => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        setAdminUser(userData);
      } catch (err) {
        console.error('Error parsing user data:', err);
      }
    }
  }, []);

  // Initial data load
  useEffect(() => {
    if (currentView !== 'students') {
      fetchDashboardStats();
      fetchServers();
      fetchServerIPs();
    }
  }, [fetchDashboardStats, fetchServers, fetchServerIPs, currentView]);

  // Auto-refresh every 30 seconds (only when not in students view)
  useEffect(() => {
    if (currentView === 'students') return;
    
    const interval = setInterval(() => {
      fetchDashboardStats();
      fetchServers();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardStats, fetchServers, currentView]);

  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    
    try {
      await Promise.all([
        fetchDashboardStats(),
        fetchServers(),
        fetchServerIPs()
      ]);
      
      // Clear any stale session data
      if (currentView === 'servers' && selectedServer) {
        // Re-fetch sessions for the currently selected server
        await fetchServerSessions(selectedServer);
      }
      
      // Clear error after successful refresh
      setError('');
    } catch (err) {
      console.error('Error during refresh:', err);
      setError('Error refreshing data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#10b981';
      case 'inactive': return '#6b7280';
      case 'maintenance': return '#f59e0b';
      case 'disconnected': return '#6b7280';
      case 'timeout': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active': return 'status-active';
      case 'inactive': return 'status-disconnected';
      case 'maintenance': return 'status-maintenance';
      case 'disconnected': return 'status-disconnected';
      default: return 'status-disconnected';
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const filteredServers = servers.filter(server => 
    server.server_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.server_ip?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredServerIPs = serverIPs.filter(server => 
    server.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.ip?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    server.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderOverview = () => {
    // Filter servers to only show those that exist in the serverIPs list
    const activeServerIPs = new Set(serverIPs.map(server => server.ip));
    const activeServers = servers.filter(server => activeServerIPs.has(server.server_ip));

    // Calculate adjusted stats based on active servers only
    const adjustedStats = dashboardStats ? {
      ...dashboardStats,
      overview: {
        total_students: dashboardStats.overview.total_students, // Keep total students unchanged
        total_sessions: activeServers.reduce((sum, server) => sum + (server.total_sessions || 0), 0),
        active_sessions: activeServers.reduce((sum, server) => sum + (server.active_sessions || 0), 0),
        total_commands: serverIPs.length === 0 ? 0 : (
          // Only count commands from sessions that belong to active servers
          activeServers.length === 0 ? 0 : dashboardStats.overview.total_commands
        )
      }
    } : null;

    return (
      <div className="content-grid">
        {adjustedStats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon">
                  <Users size={24} />
                </div>
              </div>
              <div className="stat-value">{adjustedStats.overview.total_students}</div>
              <div className="stat-label">Total Students</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon">
                  <Terminal size={24} />
                </div>
              </div>
              <div className="stat-value">{adjustedStats.overview.total_sessions}</div>
              <div className="stat-label">Total Sessions</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon">
                  <Activity size={24} />
                </div>
              </div>
              <div className="stat-value">{adjustedStats.overview.active_sessions}</div>
              <div className="stat-label">Active Sessions</div>
            </div>
            
            <div className="stat-card">
              <div className="stat-header">
                <div className="stat-icon">
                  <CommandIcon size={24} />
                </div>
              </div>
              <div className="stat-value">{adjustedStats.overview.total_commands}</div>
              <div className="stat-label">Commands Executed</div>
            </div>
          </div>
        )}

        <div className="servers-grid">
          {activeServers.map((server) => (
            <div 
              key={server.server_ip} 
              className="server-card"
              onClick={() => fetchServerSessions(server.server_ip)}
            >
              <div className="server-header">
                <div className="stat-icon">
                  <Server size={20} />
                </div>
                <div>
                  <h3 style={{margin: 0, fontSize: '1.1rem'}}>{server.server_name}</h3>
                  <p style={{margin: 0, fontSize: '0.875rem', opacity: 0.8}}>{server.server_ip}</p>
                </div>
              </div>
              
              <div className="server-status">
                <div className="status-dot"></div>
                <span>Online • Last activity: {formatDateTime(server.last_activity)}</span>
              </div>
              
              <div className="server-stats">
                <div className="server-stat">
                  <div className="server-stat-value">{server.total_sessions}</div>
                  <div className="server-stat-label">Total Sessions</div>
                </div>
                <div className="server-stat">
                  <div className="server-stat-value">{server.active_sessions}</div>
                  <div className="server-stat-label">Active Now</div>
                </div>
                <div className="server-stat">
                  <div className="server-stat-value">{server.unique_user_count}</div>
                  <div className="server-stat-label">Unique Users</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {(serverIPs.length === 0 || activeServers.length === 0) && (
          <div style={{textAlign: 'center', padding: '3rem', color: 'rgba(255, 255, 255, 0.6)'}}>
            <Server size={48} style={{margin: '0 auto 1rem'}} />
            <p>
              {serverIPs.length === 0 
                ? 'No servers configured. Add servers in the Server Management tab to get started.' 
                : 'No active servers found. Server data may need time to sync.'}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderServerSessions = () => (
    <div className="content-grid">
      <div className="breadcrumb">
        <button className="btn btn-secondary" onClick={() => setCurrentView('overview')}>
          <ArrowLeft size={16} />
          Back to Overview
        </button>
        <span className="breadcrumb-separator">•</span>
        <span>Server: {selectedServer}</span>
      </div>

      <div className="session-table">
        <div className="table-header">
          <h3 style={{margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
            <Terminal size={20} />
            Server Sessions - {selectedServer}
          </h3>
          <button className="btn btn-primary" onClick={() => fetchServerSessions(selectedServer)}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        
        {loading ? (
          <div className="loading-spinner">
            <RefreshCw size={8} className="animate-pulse" />
    
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>ID</th>
                <th>Login Time</th>
                <th>Duration</th>
                <th>Commands</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {serverSessions.map((session) => (
                <tr key={session.id} onClick={() => fetchSessionDetails(session.id)}>
                  <td>{session.user.name}</td>
                  <td>{session.user.email}</td>
                  <td>{session.user.registered_id}</td>
                  <td>{formatDateTime(session.session_details.login_time)}</td>
                  <td>{formatDuration(session.session_details.session_duration)}</td>
                  <td>{session.commands_count}</td>
                  <td>
                    <span className={`status-badge ${session.session_details.status === 'active' ? 'status-active' : 'status-disconnected'}`}>
                      <div style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: getStatusColor(session.session_details.status)}}></div>
                      {session.session_details.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const renderSessionDetails = () => (
    <div className="session-details">
      <div className="breadcrumb">
        <button className="btn btn-secondary" onClick={() => setCurrentView('servers')}>
          <ArrowLeft size={16} />
          Back to Sessions
        </button>
        <span className="breadcrumb-separator">•</span>
        <span>Session Details</span>
      </div>

      {sessionDetails && (
        <>
          <div className="session-info-card">
            <h3 style={{marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <User size={20} />
              Session Information
            </h3>
            <div className="session-info-grid">
              <div className="info-item">
                <span className="info-label">Student Name</span>
                <span className="info-value">{sessionDetails.user.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Email</span>
                <span className="info-value">{sessionDetails.user.email}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Student ID</span>
                <span className="info-value">{sessionDetails.user.registered_id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Server</span>
                <span className="info-value">{sessionDetails.server_info.name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Server IP</span>
                <span className="info-value">{sessionDetails.server_info.ip}</span>
              </div>
              <div className="info-item">
                <span className="info-label">SSH User</span>
                <span className="info-value">{sessionDetails.server_info.ssh_username}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Login Time</span>
                <span className="info-value">{formatDateTime(sessionDetails.session_details.login_time)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Logout Time</span>
                <span className="info-value">{formatDateTime(sessionDetails.session_details.logout_time)}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Duration</span>
                <span className="info-value">{formatDuration(sessionDetails.session_details.session_duration)}</span>
              </div>
              
            </div>
          </div>

          <div className="commands-section">
            <h3 style={{marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
              <CommandIcon size={20} />
              Commands Executed ({sessionDetails.commands.length})
            </h3>
            
            {sessionDetails.commands.length === 0 ? (
              <p style={{color: 'rgba(255, 255, 255, 0.6)', fontStyle: 'italic'}}>No commands executed in this session.</p>
            ) : (
              <div style={{maxHeight: '600px', overflowY: 'auto'}}>
                {sessionDetails.commands.map((command, index) => (
                  <div key={command.id} className="command-item">
                    <div className="command-header">
                      <span className="command-text">$ {command.command}</span>
                      <span className="command-time">
                        {formatDateTime(command.executed_at)}
                      </span>
                    </div>
                    {command.output && (
                      <div className="command-output">
                        {command.output}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  const renderServerManagement = () => (

    <div className="content-grid">
      <div className="search-bar">
        <div style={{position: 'relative', flex: 1}}>
          <Search size={20} style={{position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.6)'}} />
          <input
            type="text"
            placeholder="Search servers by name, IP, or description..."
            className="search-input"
            style={{paddingLeft: '44px'}}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddServerModal(true)}>
          <Plus size={16} />
          Add Server
        </button>
        
      </div>

      <div className="servers-grid">
        {filteredServerIPs.map((server) => (
          <div key={server._id} className="server-ip-card">
            <div className="server-ip-header">
              <div className="server-ip-info">
                <h3>{server.name}</h3>
                <div className="server-ip-address">{server.ip}:{server.port}</div>
              </div>
              <div className="action-buttons">
                <select
                  value={server.status}
                  onChange={(e) => updateServerStatus(server._id, e.target.value)}
                  disabled={deletingServer === server._id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px',
                    color: 'white',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.875rem',
                    opacity: deletingServer === server._id ? 0.5 : 1
                  }}
                >
                  <option value="active" style={{background: '#1f2937', color: 'white'}}>Active</option>
                  <option value="inactive" style={{background: '#1f2937', color: 'white'}}>Inactive</option>
                  <option value="maintenance" style={{background: '#1f2937', color: 'white'}}>Maintenance</option>
                </select>
                <button
                  className="btn-icon btn-delete"
                  onClick={() => deleteServer(server._id, server.ip)}
                  disabled={deletingServer === server._id}
                  title="Delete Server and All Related Data"
                  style={{
                    opacity: deletingServer === server._id ? 0.5 : 1,
                    cursor: deletingServer === server._id ? 'not-allowed' : 'pointer'
                  }}
                >
                  {deletingServer === server._id ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>

            <div className="server-status">
              <span className={`status-badge ${getStatusBadgeClass(server.status)}`}>
                <div style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: getStatusColor(server.status)}}></div>
                {server.status.charAt(0).toUpperCase() + server.status.slice(1)}
              </span>
              {deletingServer === server._id && (
                <span style={{marginLeft: '0.5rem', fontSize: '0.875rem', color: '#f59e0b'}}>
                  Deleting...
                </span>
              )}
            </div>

            <div className="server-ip-details">
              <div className="server-ip-detail">
                <div className="server-ip-detail-value">{server.port}</div>
                <div className="server-ip-detail-label">Port</div>
              </div>
              <div className="server-ip-detail">
                <div className="server-ip-detail-value">{server.max_connections}</div>
                <div className="server-ip-detail-label">Max Connections</div>
              </div>
              <div className="server-ip-detail">
                <div className="server-ip-detail-value">{formatDateTime(server.created_at).split(' ')[0]}</div>
                <div className="server-ip-detail-label">Created</div>
              </div>
            </div>

            {server.description && (
              <div style={{marginTop: '1rem', padding: '0.75rem', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '8px', fontSize: '0.875rem'}}>
                {server.description}
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredServerIPs.length === 0 && (
        <div style={{textAlign: 'center', padding: '3rem', color: 'rgba(255, 255, 255, 0.6)'}}>
          <Server size={48} style={{margin: '0 auto 1rem'}} />
          <p>No servers found. Add your first server to get started.</p>
        </div>
      )}

      {/* Add Server Modal */}
      {showAddServerModal && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setShowAddServerModal(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Add New Server</h2>
              <button className="modal-close" onClick={() => setShowAddServerModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Server Name *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Production Server 1"
                value={newServerData.name}
                onChange={(e) => setNewServerData(prev => ({...prev, name: e.target.value}))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">IP Address *</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., 192.168.1.100"
                value={newServerData.ip}
                onChange={(e) => setNewServerData(prev => ({...prev, ip: e.target.value}))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">SSH Port</label>
              <input
                type="number"
                className="form-input"
                placeholder="22"
                value={newServerData.port}
                onChange={(e) => setNewServerData(prev => ({...prev, port: parseInt(e.target.value) || 22}))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Max Connections</label>
              <input
                type="number"
                className="form-input"
                placeholder="100"
                value={newServerData.max_connections}
                onChange={(e) => setNewServerData(prev => ({...prev, max_connections: parseInt(e.target.value) || 100}))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-input form-textarea"
                placeholder="Optional description of the server..."
                value={newServerData.description}
                onChange={(e) => setNewServerData(prev => ({...prev, description: e.target.value}))}
              />
            </div>

            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowAddServerModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={addServer}
                disabled={!newServerData.name || !newServerData.ip}
              >
                <Plus size={16} />
                Add Server
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // If students view is selected, render StudentManagement component
 if (currentView === 'students') {
  return <StudentManagement onBack={() => setCurrentView('overview')} />;
}

  return (
    <div className="admin-dashboard">
      <div className="dashboard-header">
        <h1 className="dashboard-title">
          <Shield size={28} />
          Admin Dashboard
        </h1>
        <div className="dashboard-controls">
          {adminUser && (
            <div style={{
              marginRight: '1rem', 
              padding: '0.5rem 1rem', 
              background: 'rgba(255, 255, 255, 0.1)', 
              borderRadius: '8px',
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <User size={16} />
              Welcome, {adminUser.name || adminUser.username || 'Admin'}
            </div>
          )}
          <button 
            className="btn btn-secondary" 
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh All'}
          </button>
          <button className="btn btn-danger" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {error && (
          <div className="error-message">
            <AlertTriangle size={16} />
            {error}
          </div>
        )}

        <div className="navigation-tabs">
          <button 
            className={`nav-tab ${currentView === 'overview' ? 'active' : ''}`}
            onClick={() => setCurrentView('overview')}
          >
            <BarChart3 size={16} />
            Overview
          </button>
          
          <button 
            className={`nav-tab ${currentView === 'server-management' ? 'active' : ''}`}
            onClick={() => setCurrentView('server-management')}
          >
            <Globe size={16} />
            Server Management
          </button>
          <button 
            className={`nav-tab ${currentView === 'students' ? 'active' : ''}`}
            onClick={() => setCurrentView('students')}
          >
            <Users size={16} />
            Student Management
          </button>
        </div>

        {currentView === 'overview' && renderOverview()}
        {currentView === 'servers' && renderServerSessions()}
        {currentView === 'session-details' && renderSessionDetails()}
        {currentView === 'server-management' && renderServerManagement()}
      </div>
    </div>
  );
};

export default AdminDashboard;