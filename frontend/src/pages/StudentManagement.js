import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  X, 
  Search, 
  RefreshCw, 
  Trash2, 
  Edit2, 
  UserCheck,
  UserX,
  Mail,
  Hash,
  User,
  Calendar,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import './StudentManagement.css';

const StudentManagement = ({ onBack }) => {
  const [students, setStudents] = useState([]);
  const [allowedEmails, setAllowedEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(null);
  const [newStudentData, setNewStudentData] = useState({
    name: '',
    email: '',
    registered_id: '',
    role: 'student'
  });

  const API_BASE = 'http://172.184.216.215:5000/api';
  
  const getAuthHeaders = () => {
    // Try different possible token keys
    const token = localStorage.getItem('adminToken') || 
                  localStorage.getItem('token') || 
                  localStorage.getItem('authToken');
    
    console.log('Using token:', token ? 'Token found' : 'No token found');
    
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  // Fetch registered students (from Users collection)
  const fetchStudents = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/students`, {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched students:', data);
        setStudents(data);
      } else {
        console.error('Failed to fetch students:', response.status);
        throw new Error(`Failed to fetch students: ${response.status}`);
      }
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('Failed to fetch registered students');
    }
  };

  // Fetch allowed emails (from AllowedEmail collection)
  const fetchAllowedEmails = async () => {
    try {
      console.log('Fetching allowed emails...');
      
      const response = await fetch(`${API_BASE}/admin/allowed-emails`, {
        headers: getAuthHeaders()
      });
      
      console.log('Allowed emails response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched allowed emails:', data);
        setAllowedEmails(data.filter(item => item.role === 'student'));
      } else {
        console.error('Failed to fetch allowed emails:', response.status);
        const errorData = await response.json();
        console.error('Error details:', errorData);
        throw new Error(`Failed to fetch allowed emails: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error fetching allowed emails:', err);
      setError('Failed to fetch allowed emails. Please check if you are logged in.');
    }
  };

  // Add new student to AllowedEmail collection
  const addStudent = async () => {
    setError('');
    setSuccess('');

    try {
      if (!newStudentData.name.trim() || !newStudentData.email.trim() || !newStudentData.registered_id.trim()) {
        setError('Name, email, and registered ID are required');
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newStudentData.email)) {
        setError('Please enter a valid email address');
        return;
      }

      console.log('Sending request to add student:', newStudentData);

      const response = await fetch(`${API_BASE}/admin/students/allowed`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newStudentData.name.trim(),
          email: newStudentData.email.trim().toLowerCase(),
          registered_id: newStudentData.registered_id.trim(),
          role: 'student'
        })
      });

      console.log('Add student response status:', response.status);
      
      const data = await response.json();
      console.log('Add student response data:', data);
      
      if (response.ok) {
        setSuccess('Student added successfully to allowed list!');
        await fetchAllowedEmails();
        setNewStudentData({ name: '', email: '', registered_id: '', role: 'student' });
        setShowAddStudentModal(false);
      } else {
        setError(data.message || `Failed to add student (${response.status})`);
      }
    } catch (err) {
      console.error('Error adding student:', err);
      setError('Network error while adding student. Please check your connection.');
    }
  };

  // Update student in AllowedEmail collection
  const updateStudent = async () => {
    setError('');
    setSuccess('');

    try {
      if (!editingStudent.name.trim() || !editingStudent.email.trim() || !editingStudent.registered_id.trim()) {
        setError('Name, email, and registered ID are required');
        return;
      }

      const response = await fetch(`${API_BASE}/admin/students/allowed/${editingStudent._id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editingStudent)
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccess('Student updated successfully');
        await fetchAllowedEmails();
        setEditingStudent(null);
      } else {
        setError(data.message || 'Failed to update student');
      }
    } catch (err) {
      setError('Network error while updating student');
      console.error('Error updating student:', err);
    }
  };

  // Delete student from AllowedEmail collection
  const deleteStudent = async (studentId, studentEmail) => {
    if (!window.confirm(`Are you sure you want to remove "${studentEmail}" from allowed students?\n\nThis will prevent them from registering but won't affect existing registered users.`)) {
      return;
    }

    setDeletingStudent(studentId);
    setError('');
    setSuccess('');

    try {
      console.log('Deleting student with ID:', studentId);

      const response = await fetch(`${API_BASE}/admin/students/allowed/${studentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      console.log('Delete student response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('Delete student response data:', data);
        
        setSuccess(`Student "${studentEmail}" removed from allowed list successfully!`);
        setAllowedEmails(prev => prev.filter(student => student._id !== studentId));
      } else {
        const data = await response.json();
        console.log('Delete error response:', data);
        setError(data.message || `Failed to delete student (${response.status})`);
      }
    } catch (err) {
      console.error('Error deleting student:', err);
      setError('Network error while deleting student. Please check your connection.');
    } finally {
      setDeletingStudent(null);
    }
  };

  // Refresh all data
  const handleRefresh = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await Promise.all([
        fetchStudents(),
        fetchAllowedEmails()
      ]);
    } catch (err) {
      console.error('Error during refresh:', err);
      setError('Error refreshing data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
    handleRefresh();
  }, []);

  // Auto-clear messages after 5 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('');
        setSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  // Filter functions
  const filteredStudents = students.filter(student =>
    student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.registered_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAllowedEmails = allowedEmails.filter(student =>
    student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.registered_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDateTime = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
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

  return (
    <div className="student-management">
      {/* Header with Back Button */}
      <div className="page-header">
        <button className="back-button" onClick={onBack}>
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>
        <h1 className="page-title"> Student Management</h1>
      </div>

      {/* Messages */}
      {error && (
        <div className="message error-message">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="message success-message">
          <UserCheck size={16} />
          {success}
        </div>
      )}

      {/* Controls */}
      <div className="controls">
        <div className="search-container">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search students by name, email, or ID..."
            className="search-input"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="control-buttons">
          <button className="btn btn-primary" onClick={() => setShowAddStudentModal(true)}>
            <Plus size={16} />
            Add Student
          </button>
          <button className="btn btn-secondary" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="content-grid">
        {/* Registered Students */}
        <div className="students-section">
          <div className="section-header">
            <h3 className="section-title">
              <UserCheck size={20} />
              Registered Students ({filteredStudents.length})
            </h3>
            <p className="section-description">
              Students who have completed registration
            </p>
          </div>

          <div className="students-list">
            {filteredStudents.map((student) => (
              <div key={student.id} className="student-card registered">
                <div className="student-header">
                  <div className="student-info">
                    <h4 className="student-name">{student.name}</h4>
                    <div className="student-details">
                      <span><Mail size={14} /> {student.email}</span>
                      <span><Hash size={14} /> {student.registered_id}</span>
                    </div>
                  </div>
                  <div className="student-status">
                    <span className="status-badge status-active">
                      <UserCheck size={12} />
                      Registered
                    </span>
                  </div>
                </div>

                <div className="student-stats">
                  <div className="stat">
                    <div className="stat-value">{student.statistics?.total_sessions || 0}</div>
                    <div className="stat-label">Sessions</div>
                  </div>
                  
                  <div className="stat">
                    <div className="stat-value stat-font-size">{formatDuration(student.statistics?.total_duration)}</div>
                    <div className="stat-label">Total Time</div>
                  </div>
                </div>

                
              </div>
            ))}

            {filteredStudents.length === 0 && (
              <div className="empty-state">
                <UserCheck size={48} />
                <p>No registered students found</p>
              </div>
            )}
          </div>
        </div>

        {/* Allowed Students (Not Yet Registered) */}
        <div className="students-section">
          <div className="section-header">
            <h3 className="section-title">
              <UserX size={20} />
              Allowed Students ({filteredAllowedEmails.length})
            </h3>
            <p className="section-description">
              Students approved for registration
            </p>
          </div>

          <div className="students-list">
            {filteredAllowedEmails.map((student) => (
              <div key={student._id} className="student-card allowed">
                <div className="student-header">
                  <div className="student-info">
                    <h4 className="student-name">{student.name || 'Name not set'}</h4>
                    <div className="student-details">
                      <span><Mail size={14} /> {student.email}</span>
                      {student.registered_id && <span><Hash size={14} /> {student.registered_id}</span>}
                    </div>
                  </div>
                  <div className="student-actions">
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => setEditingStudent(student)}
                      disabled={deletingStudent === student._id}
                      title="Edit Student"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => deleteStudent(student._id, student.email)}
                      disabled={deletingStudent === student._id}
                      title="Remove from Allowed List"
                    >
                      {deletingStudent === student._id ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>

                

                <div className="student-meta">
                  <span>Added: {formatDateTime(student.createdAt)}</span>
                  
                </div>
              </div>
            ))}

            {filteredAllowedEmails.length === 0 && (
              <div className="empty-state">
                <UserX size={48} />
                <p>No pending students found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAddStudentModal && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setShowAddStudentModal(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Add New Student</h2>
              <button className="modal-close" onClick={() => setShowAddStudentModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Student Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter student name"
                  value={newStudentData.name}
                  onChange={(e) => setNewStudentData(prev => ({...prev, name: e.target.value}))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="Enter student email address"
                  value={newStudentData.email}
                  onChange={(e) => setNewStudentData(prev => ({...prev, email: e.target.value}))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Student ID *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Student ID"
                  value={newStudentData.registered_id}
                  onChange={(e) => setNewStudentData(prev => ({...prev, registered_id: e.target.value}))}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowAddStudentModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={addStudent}
                disabled={!newStudentData.name.trim() || !newStudentData.email.trim() || !newStudentData.registered_id.trim()}
              >
                <Plus size={16} />
                Add Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setEditingStudent(null)}>
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title">Edit Student Details</h2>
              <button className="modal-close" onClick={() => setEditingStudent(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Student Name *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder=""
                  value={editingStudent.name || ''}
                  onChange={(e) => setEditingStudent(prev => ({...prev, name: e.target.value}))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="Enter student email address"
                  value={editingStudent.email || ''}
                  onChange={(e) => setEditingStudent(prev => ({...prev, email: e.target.value}))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Student ID *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Student ID"
                  value={editingStudent.registered_id || ''}
                  onChange={(e) => setEditingStudent(prev => ({...prev, registered_id: e.target.value}))}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button 
                className="btn btn-secondary" 
                onClick={() => setEditingStudent(null)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={updateStudent}
                disabled={!editingStudent.name?.trim() || !editingStudent.email?.trim() || !editingStudent.registered_id?.trim()}
              >
                <Edit2 size={16} />
                Update Student
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;