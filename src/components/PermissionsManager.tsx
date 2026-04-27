import React, { useState, useEffect } from 'react';
import { db, auth, registerWithEmail } from '../lib/firebase';
import { UserPlus, Trash2, Shield, Mail, X, Lock, Eye, EyeOff, User as UserIcon, Users, ChevronDown, Edit2, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  query, 
  serverTimestamp,
  setDoc,
  where,
  getDocs,
  updateDoc
} from 'firebase/firestore';
import { initializeApp, deleteApp, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

interface AuthorizedUser {
  id: string;
  email: string;
  username?: string;
  role: 'creator' | 'admin' | 'staff';
  status?: 'active' | 'pending';
  addedAt: any;
}

interface PermissionsManagerProps {
  onClose: () => void;
  currentUserEmail: string;
}

export default function PermissionsManager({ onClose, currentUserEmail }: PermissionsManagerProps) {
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newRole, setNewRole] = useState<'creator' | 'admin' | 'staff'>('staff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<'creator' | 'admin' | 'staff'>('staff');
  const [showEditPassword, setShowEditPassword] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'authorized_users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuthorizedUser));
      setUsers(data);
    });
    return unsubscribe;
  }, []);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newUsername.trim()) return;
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // 0. Check if username exists
      const qUsername = query(collection(db, 'authorized_users'), where('username', '==', newUsername.trim().toLowerCase()));
      const usernameDoc = await getDocs(qUsername);
      if (!usernameDoc.empty) {
        throw new Error('Tên đăng nhập đã tồn tại');
      }

      // 1. If password provided, create the user in Firebase Auth using a secondary app instance
      // to avoid signing out the current admin user
      if (newPassword.trim()) {
        const secondaryAppName = `secondary-${Date.now()}`;
        const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);
        
        try {
          await createUserWithEmailAndPassword(secondaryAuth, newEmail.trim(), newPassword.trim());
          // Sign out the secondary app immediately
          await signOut(secondaryAuth);
          await deleteApp(secondaryApp);
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
             // Email already exists in Auth, we just update the profile in Firestore
          } else {
            throw err;
          }
        }
      }

      // 2. Create the profile record in Firestore
      await setDoc(doc(db, 'authorized_users', newEmail.trim().toLowerCase()), {
        email: newEmail.trim().toLowerCase(),
        username: newUsername.trim(),
        role: newRole,
        status: 'active',
        addedAt: serverTimestamp(),
        addedBy: currentUserEmail
      });

      setNewEmail('');
      setNewUsername('');
      setNewPassword('');
      setSuccess('Đã thêm nhân sự thành công!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error adding user:', err);
      setError(err.message || 'Có lỗi xảy ra khi thêm nhân sự');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id: string, email: string) => {
    if (email === 'longvuptk10@gmail.com') return;
    if (!confirm(`Bạn có chắc chắn muốn xóa ${email}?`)) return;
    
    try {
      await deleteDoc(doc(db, 'authorized_users', id));
      setSuccess('Đã xóa nhân sự thành công');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error: any) {
      console.error('Error deleting user:', error);
      setError('Lỗi khi xóa nhân sự: ' + (error.message || 'Không có quyền'));
    }
  };

  const handleApproveUser = async (id: string) => {
    try {
      await updateDoc(doc(db, 'authorized_users', id), {
        status: 'active'
      });
      setSuccess('Đã phê duyệt nhân sự!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error approving user:', err);
    }
  };

  const handleStartEdit = (user: AuthorizedUser) => {
    setEditingId(user.id);
    setEditUsername(user.username || '');
    setEditRole(user.role);
    setEditPassword('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditUsername('');
    setEditPassword('');
  };

  const handleUpdateUser = async (id: string) => {
    if (!editUsername.trim()) return;
    setLoading(true);
    try {
      // Check if username unique (excluding current user)
      const qUsername = query(
        collection(db, 'authorized_users'), 
        where('username', '==', editUsername.trim().toLowerCase())
      );
      const usernameSnap = await getDocs(qUsername);
      
      const isActuallyChanging = users.find(u => u.id === id)?.username !== editUsername.trim();
      
      if (isActuallyChanging && !usernameSnap.empty) {
        throw new Error('Tên đăng nhập đã tồn tại');
      }

      const updateData: any = {
        username: editUsername.trim(),
        role: editRole
      };

      if (editPassword.trim()) {
        if (editPassword.trim().length < 6) {
          throw new Error('Mật khẩu mới phải từ 6 ký tự');
        }
        updateData.password = editPassword.trim(); // Store in Firestore so admin/user can see it if needed
      }

      await updateDoc(doc(db, 'authorized_users', id), updateData);
      
      setSuccess('Đã cập nhật thông tin!');
      setEditingId(null);
      setEditPassword('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Error updating user:', err);
      setError(err.message || 'Lỗi khi cập nhật');
    } finally {
      setLoading(false);
    }
  };

  const activeUsers = users.filter(u => u.status !== 'pending');
  const pendingUsers = users.filter(u => u.status === 'pending');

  return (
    <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden w-full max-w-lg">
      <div className="bg-slate-900 p-8 text-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase">Nhân Sự</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Management System</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/50">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-8 space-y-8">
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nhanvien@gmail.com"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tên đăng nhập</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="nv01"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full pl-11 pr-10 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cấp bậc</label>
              <div className="relative">
                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select 
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                >
                  <option value="staff">Nhân viên</option>
                  <option value="admin">Quản lý (Admin)</option>
                  <option value="creator">Khởi tạo (Creator)</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {error && <p className="text-[10px] font-bold text-rose-500 px-1">{error}</p>}
          {success && <p className="text-[10px] font-bold text-emerald-500 px-1">{success}</p>}

          <button 
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            <UserPlus className="w-4 h-4" />
            {loading ? 'Đang xử lý...' : 'Thêm & Cấp Quyền'}
          </button>
        </form>

        <div className="space-y-4">
          {pendingUsers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                  Yêu cầu đang chờ ({pendingUsers.length})
                </h3>
              </div>
              <div className="space-y-2">
                {pendingUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-rose-50/50 border border-rose-100 rounded-[20px] group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-sm font-black">
                        {u.username?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 leading-tight">{(u.username || u.email.split('@')[0]).toUpperCase()}</p>
                        <p className="text-[9px] font-medium text-slate-400">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-xl transition-all"
                        title="Xóa yêu cầu"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleApproveUser(u.id)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all"
                      >
                        Đồng ý
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Danh sách nhân sự ({activeUsers.length})</h3>
          </div>
          
          <div className="max-h-60 overflow-y-auto space-y-3 pr-2 scrollbar-none">
            {activeUsers.length === 0 && (
              <div className="text-center py-12 bg-slate-50 rounded-[24px] border-2 border-dashed border-slate-100">
                <UserIcon className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">Trống</p>
              </div>
            )}
            {activeUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-[20px] shadow-sm hover:shadow-md transition-all group">
                <div className="flex items-center gap-4 flex-1">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black transition-transform group-hover:rotate-3 shrink-0",
                    u.role === 'creator' ? "bg-rose-100 text-rose-600 ring-4 ring-rose-50" : 
                    u.role === 'admin' ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"
                  )}>
                    {u.username?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === u.id ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input 
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Tên mới"
                            autoFocus
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <input 
                            type={showEditPassword ? "text" : "password"}
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Mật khẩu mới (Để trống nếu ko đổi)"
                          />
                          <button 
                            type="button"
                            onClick={() => setShowEditPassword(!showEditPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"
                          >
                            {showEditPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="relative">
                          <Shield className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                          <select 
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as any)}
                            className="w-full pl-8 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none appearance-none"
                          >
                            <option value="staff">Nhân viên</option>
                            <option value="admin">Quản lý (Admin)</option>
                            <option value="creator">Khởi tạo (Creator)</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-slate-800 leading-tight">{(u.username || u.email.split('@')[0]).toUpperCase()}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md",
                            u.role === 'creator' ? "bg-rose-50 text-rose-600 ring-1 ring-rose-100" :
                            u.role === 'admin' ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600"
                          )}>{u.role}</span>
                          <span className="text-[9px] font-medium text-slate-400 truncate">{u.email}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {editingId === u.id ? (
                    <>
                      <button 
                        onClick={() => handleUpdateUser(u.id)}
                        className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-all"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={handleCancelEdit}
                        className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleStartEdit(u)}
                        className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {u.email !== 'longvuptk10@gmail.com' && (
                        <button 
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="p-2.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all group-hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
