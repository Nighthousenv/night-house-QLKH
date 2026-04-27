import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, signInWithGoogle, loginWithEmail, registerWithEmail, signOut } from './lib/firebase';
import { Booking, AuthProfile } from './types';
import { INITIAL_HOMESTAYS } from './constants';
import { MonthlyChart, HourlyChart } from './components/Charts';
import BookingForm from './components/BookingForm';
import ExportButton from './components/ExportButton';
import PermissionsManager from './components/PermissionsManager';
import { cn } from './lib/utils';
import { 
  BarChart3, 
  Calendar, 
  Clock, 
  Home, 
  Plus, 
  LogOut, 
  LogIn, 
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  Shield,
  Key,
  Mail,
  Lock,
  ChevronDown,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addMonths, subMonths, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staffs, setStaffs] = useState<any[]>([]);
  const [selectedHomestayIds, setSelectedHomestayIds] = useState<string[]>([INITIAL_HOMESTAYS[0].id]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState(false);
  const [quickAddData, setQuickAddData] = useState<any>(null);
  const [viewDate, setViewDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'monthly' | 'hourly-3d' | 'hourly-24' | 'monthly-detail'>('monthly');
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Login form state
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState(''); // Email or Username
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Register form state
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');

  const ROOT_OWNER_EMAIL = 'longvuptk10@gmail.com';

  const toggleHomestay = (id: string) => {
    setSelectedHomestayIds(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one selected
        return prev.filter(item => item !== id);
      }
      return [...prev, id];
    });
  };

  const selectedHomestays = INITIAL_HOMESTAYS.filter(h => selectedHomestayIds.includes(h.id));
  const primaryHomestay = selectedHomestays[0] || INITIAL_HOMESTAYS[0];

  useEffect(() => {
    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (u) => {
      // Clean up previous profile listener if it exists
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      setUser(u);
      
      if (u) {
        setAuthChecking(true);
        const userEmail = u.email?.toLowerCase() || '';
        
        // Listen to the profile
        profileUnsubscribe = onSnapshot(doc(db, 'authorized_users', userEmail), (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as AuthProfile;
            setProfile(data);
            setIsAuthorized(data.status !== 'pending');
          } else if (userEmail === ROOT_OWNER_EMAIL.toLowerCase()) {
            // Root owner fallback if not in database yet
            setProfile({
              email: ROOT_OWNER_EMAIL,
              username: 'CREATOR',
              role: 'creator',
              status: 'active',
              addedAt: new Date()
            });
            setIsAuthorized(true);
          } else {
            setProfile(null);
            setIsAuthorized(false);
          }
          setAuthChecking(false);
          setLoading(false);
        }, (err) => {
          console.error("Profile sync error:", err);
          setAuthChecking(false);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setIsAuthorized(false);
        setAuthChecking(false);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      setBookings([]);
      return;
    }

    // SHARED POOL: Historically bookings were under userId == user.uid.
    // In a team environment, we use a shared key.
    // For this specific app instance, we'll use a fixed key 'night_house_shared'
    // but also support the original owner's ID if we want to migrate.
    const q = query(collection(db, 'bookings')); // For simple shared access for this specific app instance
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(data);
    });

    const staffQ = query(collection(db, 'authorized_users'), where('status', '==', 'active'));
    const staffUnsubscribe = onSnapshot(staffQ, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          id: doc.id, 
          name: (d.username || d.email.split('@')[0]).toUpperCase(),
          color: '#6366f1' // Default color for all active users
        };
      });
      setStaffs(data);
    });

    return () => {
      unsubscribe();
      staffUnsubscribe();
    };
  }, [user, isAuthorized]);

  useEffect(() => {
    // Listen for pending registrations if admin or creator
    if (profile?.role === 'admin' || profile?.role === 'creator') {
      const q = query(collection(db, 'authorized_users'), where('status', '==', 'pending'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setPendingCount(snapshot.size);
      }, (err) => {
        console.error("Error listening for pending users:", err);
      });
      return unsubscribe;
    } else {
      setPendingCount(0);
    }
  }, [profile?.role]);

  if (loading || authChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin shadow-lg" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest animate-pulse">NIGHT HOUSE IS READY</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    const handleAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoginError('');
      setLoginLoading(true);

      try {
        if (authMode === 'login') {
          let finalEmail = identifier;
          
          if (!identifier.includes('@')) {
            const q = query(collection(db, 'authorized_users'), where('username', '==', identifier.toLowerCase()));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
              throw new Error('Tên đăng nhập không tồn tại');
            }
            finalEmail = querySnapshot.docs[0].data().email;
          }

          await loginWithEmail(finalEmail, password);
        } else {
          if (regPass !== regConfirmPass) {
            throw new Error('Mật khẩu xác nhận không khớp');
          }
          if (regUsername.length < 3) {
            throw new Error('Tên đăng nhập ít nhất 3 ký tự');
          }

          const q = query(collection(db, 'authorized_users'), where('username', '==', regUsername.toLowerCase()));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            throw new Error('Tên đăng nhập đã được sử dụng');
          }

          await registerWithEmail(regEmail, regPass);
          
          await setDoc(doc(db, 'authorized_users', regEmail.toLowerCase()), {
            email: regEmail.toLowerCase(),
            username: regUsername.trim(),
            role: 'staff',
            status: 'pending',
            addedAt: new Date()
          });

          setAuthMode('login');
          setIdentifier(regEmail);
          setLoginError('Đăng ký thành công! Vui lòng đăng nhập.');
        }
      } catch (err: any) {
        console.error(err);
        let msg = err.message || 'Có lỗi xảy ra';
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') msg = 'Sai tài khoản hoặc mật khẩu';
        if (err.code === 'auth/invalid-email') msg = 'Email không hợp lệ';
        if (err.code === 'auth/email-already-in-use') msg = 'Email đã được đăng ký';
        if (err.code === 'auth/weak-password') msg = 'Mật khẩu quá yếu (tối thiểu 6 ký tự)';
        setLoginError(msg);
      } finally {
        setLoginLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-[32px] p-8 shadow-2xl shadow-indigo-100 border border-slate-100"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-200 mb-4 rotate-3">
              <Home className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight uppercase">NIGHT HOUSE</h1>
            <p className="text-sm text-slate-400 font-medium mt-1">Hệ thống quản lý Homestay</p>
          </div>

          <div className="flex p-1 bg-slate-50 rounded-2xl mb-6">
            <button 
              onClick={() => {
                setAuthMode('login');
                setLoginError('');
              }}
              className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                authMode === 'login' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
              )}
            >
              Đăng nhập
            </button>
            <button 
              onClick={() => {
                setAuthMode('register');
                setLoginError('');
              }}
              className={cn(
                "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                authMode === 'register' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"
              )}
            >
              Đăng ký
            </button>
          </div>

          {user && !isAuthorized ? (
            <div className="text-center">
              <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100 mb-6">
                <Shield className="w-10 h-10 text-amber-500 mx-auto mb-3" />
                {profile?.status === 'pending' ? (
                  <>
                    <p className="text-sm font-bold text-amber-800">Đang chờ duyệt</p>
                    <p className="text-[11px] text-amber-600 font-medium mt-1">Tài khoản của bạn đang chờ quản trị viên phê duyệt. Vui lòng quay lại sau.</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-bold text-amber-800">Chưa được cấp quyền</p>
                    <p className="text-[11px] text-amber-600 font-medium mt-1">Tài khoản {user.email} chưa được cấp phép truy cập.</p>
                  </>
                )}
              </div>
              <button
                onClick={signOut}
                className="w-full bg-slate-100 text-slate-600 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
              >
                <LogOut className="w-4 h-4" />
                Đăng xuất
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <form onSubmit={handleAuth} className="space-y-3">
                {authMode === 'login' ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Tên đăng nhập hoặc Email"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="password"
                        placeholder="Mật khẩu"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Tên đăng nhập mới"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="email"
                        placeholder="Địa chỉ Email (Để khôi phục)"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="password"
                        placeholder="Mật khẩu"
                        value={regPass}
                        onChange={(e) => setRegPass(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>
                    <div className="relative">
                      <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input 
                        type="password"
                        placeholder="Xác nhận mật khẩu"
                        value={regConfirmPass}
                        onChange={(e) => setRegConfirmPass(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        required
                      />
                    </div>
                  </div>
                )}

                {loginError && (
                  <p className={cn(
                    "text-[11px] font-bold px-4 pt-1",
                    loginError.includes('thành công') ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {loginError}
                  </p>
                )}

                <button 
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Key className="w-4 h-4" />
                  {authMode === 'login' ? 'Đăng nhập ngay' : 'Đăng ký tài khoản'}
                </button>
              </form>

              <div className="relative flex items-center gap-4">
                <div className="h-px bg-slate-100 flex-1" />
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Hoặc</span>
                <div className="h-px bg-slate-100 flex-1" />
              </div>

              <button 
                onClick={signInWithGoogle}
                className="w-full bg-white border border-slate-200 text-slate-600 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-50 active:scale-95 transition-all"
              >
                <img src="https://www.google.com/favicon.ico" alt="google" className="w-4 h-4" />
                Đăng nhập nhanh bằng Google
              </button>
            </div>
          )}
        </motion.div>
        <p className="mt-8 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Shield className="w-3 h-3" />
          Hệ thống bảo mật bởi Night House
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800 font-sans overflow-hidden relative">
      {/* Sidebar - Responsive */}
      <AnimatePresence>
        {(isMobileMenuOpen || window.innerWidth >= 1024) && (
          <>
            <motion.aside 
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={cn(
                "fixed inset-y-0 left-0 z-40 w-72 lg:relative lg:translate-x-0 flex flex-col gap-4 p-4 border-r border-slate-200 bg-slate-50 shrink-0 shadow-2xl lg:shadow-none",
                !isMobileMenuOpen && "hidden lg:flex"
              )}
            >
              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Home className="w-5 h-5 text-indigo-600" />
                    <h1 className="text-lg font-bold text-indigo-900 tracking-tight uppercase">NIGHT HOUSE</h1>
                  </div>
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">Cơ sở của bạn</p>
                  {INITIAL_HOMESTAYS.map(h => {
                    const isSelected = selectedHomestayIds.includes(h.id);
                    return (
                      <button
                        key={h.id}
                        onClick={() => toggleHomestay(h.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between group",
                          isSelected 
                            ? "bg-indigo-50 text-indigo-700 border border-indigo-100" 
                            : "text-slate-600 hover:bg-white hover:shadow-sm"
                        )}
                      >
                        <span className="truncate">{h.name}</span>
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0 transition-colors",
                          isSelected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-slate-300 group-hover:bg-slate-400"
                        )} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-200 flex flex-col justify-between flex-1">
                <div>
                  <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4 text-center">Hành động nhanh</h2>
                  <button
                    onClick={() => {
                      setShowAddModal(true);
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    Thêm Đặt Phòng
                  </button>
                  <button
                    onClick={() => {
                      setQuickAddMode(!quickAddMode);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "w-full mt-2 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 active:scale-95 border-2",
                      quickAddMode 
                        ? "bg-amber-50 border-amber-500 text-amber-700 shadow-inner" 
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
                    )}
                  >
                    <Clock className="w-5 h-5" />
                    {quickAddMode ? 'Đang bật Thêm nhanh' : 'Thêm nhanh'}
                  </button>
                </div>

                  {user ? (
                    <div className="mt-auto space-y-4">
                      {(profile?.role === 'admin' || profile?.role === 'creator') && (
                        <button
                          onClick={() => {
                            setShowPermissionsModal(true);
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full py-3 bg-slate-800 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-slate-200 relative"
                        >
                          <Users className="w-5 h-5" />
                          Quản lý Nhân sự
                          {pendingCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                              {pendingCount}
                            </span>
                          )}
                        </button>
                      )}
                      
                      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-9 h-9 rounded-full border-2 border-white shadow-sm shrink-0 bg-indigo-100 flex items-center justify-center text-xs font-black text-indigo-600">
                            {user.photoURL ? (
                              <img 
                                src={user.photoURL} 
                                alt="avatar" 
                                referrerPolicy="no-referrer"
                                className="w-full h-full rounded-full" 
                              />
                            ) : (
                              user.email?.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {(profile?.username || user.displayName || user.email?.split('@')[0])?.toUpperCase()}
                            </p>
                            <p className="text-[9px] font-medium text-slate-400 truncate tracking-tight lowercase">{user.email}</p>
                          </div>
                        </div>
                        <button onClick={signOut} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-rose-500">
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : null}
              </div>
            </motion.aside>

            {/* Mobile Overlay */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
            />
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-100 overflow-hidden h-full">
        {/* Compact Header */}
        <header className="flex items-center justify-between bg-white px-2 lg:px-4 py-2 lg:py-3 shadow-sm border-b border-slate-200 z-20">
          <div className="flex items-center gap-1 lg:gap-4 shrink-0">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-600"
            >
              <LayoutDashboard className="w-5 h-5" />
            </button>
            <div className="flex gap-0.5 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('monthly')}
                className={cn(
                  "px-2 lg:px-3 py-1.5 rounded-md text-[9px] lg:text-[11px] font-bold uppercase tracking-wide transition-all",
                  activeTab === 'monthly' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Tháng
              </button>
              <button
                onClick={() => setActiveTab('hourly-3d')}
                className={cn(
                  "px-2 lg:px-3 py-1.5 rounded-md text-[9px] lg:text-[11px] font-bold uppercase tracking-wide transition-all",
                  activeTab === 'hourly-3d' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                72H
              </button>
              <button
                onClick={() => setActiveTab('hourly-24')}
                className={cn(
                  "px-2 lg:px-3 py-1.5 rounded-md text-[9px] lg:text-[11px] font-bold uppercase tracking-wide transition-all",
                  activeTab === 'hourly-24' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                24H
              </button>
              <button
                onClick={() => setActiveTab('monthly-detail')}
                className={cn(
                  "px-2 lg:px-3 py-1.5 rounded-md text-[9px] lg:text-[11px] font-bold uppercase tracking-wide transition-all",
                  activeTab === 'monthly-detail' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Chi tiết tháng
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
            {(profile?.role === 'admin' || profile?.role === 'creator') && <ExportButton bookings={bookings} staffs={staffs} />}
            {activeTab === 'monthly' && (
              <div className="flex items-center gap-1 lg:gap-2">
                <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-1 hover:bg-slate-50 rounded text-slate-400">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] lg:text-xs font-bold text-slate-600 min-w-[70px] lg:min-w-[100px] text-center uppercase tracking-tighter">
                  {format(viewDate, 'MM yyyy')}
                </span>
                <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-1 hover:bg-slate-50 rounded text-slate-400">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            {activeTab === 'hourly-24' && (
              <div className="hidden sm:flex items-center gap-2">
                <input 
                  type="date" 
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="bg-slate-50 px-2 py-1 rounded border border-slate-200 text-xs font-bold text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}
            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />
            <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 rounded-lg border border-indigo-100 max-w-[150px] lg:max-w-none">
              <LayoutDashboard className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <div className="flex gap-1 overflow-hidden">
                {selectedHomestays.map((h, i) => (
                  <span key={h.id} className="text-[10px] lg:text-[11px] font-bold text-indigo-700 uppercase tracking-tight truncate">
                    {h.name.split('-')[1]?.trim() || h.name}
                    {i < selectedHomestays.length - 1 && ","}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <section className="flex-1 overflow-y-auto overflow-x-hidden p-1.5 sm:p-3 lg:p-4 scrollbar-none">
          <AnimatePresence mode="wait">
            {activeTab === 'monthly' && (
              <motion.div
                key="monthly"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pb-2 sm:pb-4 space-y-4 sm:space-y-8"
              >
                {selectedHomestays.map(homestay => (
                  <div key={homestay.id} className="space-y-2 sm:space-y-3">
                    <div className="flex items-center gap-1.5 sm:gap-2 px-0.5 sm:px-1">
                      <div className="w-1 h-3 sm:h-4 bg-indigo-500 rounded-full" />
                      <h3 className="text-[10px] sm:text-xs font-black text-slate-800 uppercase tracking-widest">{homestay.name}</h3>
                    </div>
                    <MonthlyChart 
                      bookings={bookings} 
                      staffs={staffs}
                      homestayId={homestay.id} 
                      selectedDate={viewDate} 
                      userRole={profile?.role}
                      onDateSelect={(date) => {
                        setCustomDate(date);
                        setActiveTab('hourly-24');
                      }}
                    />
                  </div>
                ))}
              </motion.div>
            )}
            {(activeTab === 'hourly-3d' || activeTab === 'hourly-24' || activeTab === 'monthly-detail') && (
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="pb-4 space-y-12"
              >
                {selectedHomestays.map(homestay => (
                  <div key={homestay.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                          {homestay.name} - 
                          {activeTab === 'hourly-3d' && ' 72 giờ'}
                          {activeTab === 'hourly-24' && ' 24 giờ'}
                          {activeTab === 'monthly-detail' && ' Chi tiết tháng'}
                        </h2>
                      </div>
                      <div className="hidden sm:flex flex-wrap items-center gap-3 text-[9px] font-bold text-slate-400">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-white border border-slate-200"></div> Trống</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-indigo-500"></div> Đã đặt</span>
                      </div>
                    </div>
                    <HourlyChart 
                      bookings={bookings} 
                      staffs={staffs}
                      homestayId={homestay.id} 
                      selectedDate={
                        activeTab === 'monthly-detail' ? startOfMonth(viewDate) :
                        activeTab === 'hourly-3d' ? startOfDay(new Date()) : 
                        startOfDay(new Date(customDate))
                      } 
                      userRole={profile?.role}
                      daysCount={
                        activeTab === 'monthly-detail' ? eachDayOfInterval({ start: startOfMonth(viewDate), end: endOfMonth(viewDate) }).length :
                        activeTab === 'hourly-3d' ? 3 : 1
                      }
                      onEdit={(booking) => {
                        console.log('Edit booking:', booking);
                      }}
                      isQuickAddMode={quickAddMode}
                      onQuickAdd={(data) => {
                        setQuickAddData(data);
                        setQuickAddMode(false);
                        setShowAddModal(true);
                      }}
                    />
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      <AnimatePresence>
        {showAddModal && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full max-w-md my-auto"
            >
              <BookingForm 
                onSuccess={() => {
                  setShowAddModal(false);
                  setQuickAddData(null);
                }} 
                onCancel={() => {
                  setShowAddModal(false);
                  setQuickAddData(null);
                }} 
                selectedHomestay={primaryHomestay}
                existingBookings={bookings}
                initialDate={activeTab === 'hourly-24' ? customDate : format(new Date(), 'yyyy-MM-dd')}
                quickAddData={quickAddData}
                currentProfile={profile}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPermissionsModal && (
          <div 
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowPermissionsModal(false)}
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-[70] w-full max-w-lg my-auto"
            >
              <PermissionsManager 
                currentUserEmail={user?.email || ''} 
                onClose={() => setShowPermissionsModal(false)} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
