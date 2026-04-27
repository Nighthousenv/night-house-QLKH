import React from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  startOfDay, 
  endOfDay, 
  addDays, 
  isWithinInterval,
  getHours,
  setHours,
  setMinutes
} from 'date-fns';
import { Calendar, Info, Edit2, Trash2, AlertCircle, X } from 'lucide-react';
import { Booking, BookingStatus } from '../types';
import { ROOMS_BY_HOMESTAY, INITIAL_HOMESTAYS } from '../constants';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../lib/firebase';
import { DateTimeTrigger } from './Pickers';
import { deleteDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';

interface ChartProps {
  bookings: Booking[];
  staffs: any[];
  homestayId: string;
  selectedDate: Date;
  userRole?: string;
  onDateSelect?: (date: string) => void;
  onEdit?: (booking: Booking) => void;
}

/**
 * Shared Components
 */

function ConfirmDialog({ 
  isOpen, 
  title, 
  description, 
  type, 
  onConfirm, 
  onCancel 
}: { 
  isOpen: boolean; 
  title: string; 
  description: string; 
  type: 'delete' | 'edit';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100"
          >
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mb-4",
              type === 'delete' ? "bg-rose-50 text-rose-500" : "bg-indigo-50 text-indigo-500"
            )}>
              {type === 'delete' ? <AlertCircle className="w-6 h-6" /> : <Edit2 className="w-6 h-6" />}
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
            <p className="text-sm text-slate-500 mb-6 font-medium leading-relaxed">{description}</p>

            <div className="flex gap-3">
              <button 
                onClick={onCancel}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-100 text-[11px] font-bold text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-wider"
              >
                Hủy bỏ
              </button>
              <button 
                onClick={onConfirm}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-[11px] font-bold text-white transition-all shadow-lg active:scale-95 uppercase tracking-wider",
                  type === 'delete' ? "bg-rose-500 hover:bg-rose-600" : "bg-indigo-600 hover:bg-indigo-700"
                )}
              >
                Xác nhận
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function BookingDetailPanel({ 
  booking, 
  onClose,
  onDeleted,
  staffs = [],
  allBookings = [],
  userRole
}: { 
  booking: Booking | null; 
  onClose: () => void;
  onDeleted?: () => void;
  staffs?: any[];
  allBookings?: Booking[];
  userRole?: string;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);
  const [editForm, setEditForm] = React.useState<Partial<Booking>>({});
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmEdit, setConfirmEdit] = React.useState(false);

  const isStaffActive = booking ? staffs.some(s => s.name === booking.staffName) : true;
  const canModify = ['admin', 'creator'].includes(userRole || '') || (isStaffActive && userRole === 'staff' && booking?.status !== 'Cancelled');

  React.useEffect(() => {
    if (booking) {
      setEditForm({
        price: booking.price,
        depositAmount: booking.depositAmount,
        paymentStatus: booking.paymentStatus,
        staffName: booking.staffName,
        staffColor: booking.staffColor,
        roomId: booking.roomId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut
      });
      setIsEditing(false);
      setShowHistory(false);
    }
  }, [booking]);

  if (!booking) return null;

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'bookings', booking.id!));
      onDeleted?.();
      onClose();
    } catch (error) {
      console.error('Error deleting booking:', error);
    }
  };

  const handleEdit = async () => {
    try {
      const docRef = doc(db, 'bookings', booking.id!);
      
      const start = editForm.checkIn?.toDate();
      const end = editForm.checkOut?.toDate();

      if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
        alert('Vui lòng chọn thời gian hợp lệ');
        return;
      }

      if (end <= start) {
        alert('Giờ trả phòng phải sau giờ nhận phòng');
        return;
      }

      const now = new Date();
      const isOngoing = booking && booking.checkIn.toDate() <= now && booking.checkOut.toDate() >= now;
      const isFuture = start >= now;

      if (!isFuture && !isOngoing && !['admin', 'creator'].includes(userRole || '')) {
        alert('Không thể chỉnh sửa lịch đã kết thúc hoặc đặt ở quá khứ');
        return;
      }

      // Overlap check for edit (including 30-minute cleaning buffer)
      const CLEANING_BUFFER = 30 * 60 * 1000;
      const hasOverlap = allBookings.some(b => {
        // Skip current booking being edited and cancelled ones
        if (b.id === booking.id || b.status === 'Cancelled') return false;
        // Same room and homestay check
        if (b.homestayId !== booking.homestayId || b.roomId !== (editForm.roomId || booking.roomId)) return false;

        const bStart = b.checkIn.toDate().getTime();
        const bEnd = b.checkOut.toDate().getTime();
        
        const newStart = start.getTime();
        const newEnd = end.getTime();

        return (newStart < bEnd + CLEANING_BUFFER) && (bStart < newEnd + CLEANING_BUFFER);
      });

      if (hasOverlap) {
        alert(`Trùng lịch! Phòng ${editForm.roomId || booking.roomId} đã có khách hoặc đang trong thời gian dọn dẹp (30p sau mỗi lịch).`);
        return;
      }
      
      const historyEntry = {
        price: booking.price,
        depositAmount: booking.depositAmount,
        paymentStatus: booking.paymentStatus,
        staffName: booking.staffName,
        roomId: booking.roomId,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        updatedAt: Timestamp.now()
      };

      const newHistory = [historyEntry, ...(booking.history || [])];

      await updateDoc(docRef, {
        ...editForm,
        isEdited: true,
        history: newHistory
      });

      onClose();
    } catch (error) {
      console.error('Error updating booking:', error);
    }
  };

  return (
    <>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="border-t border-slate-100 bg-slate-50/50"
      >
        <div className="p-4 flex flex-col md:flex-row gap-6 relative">
          <button 
            onClick={onClose}
            className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
                style={{ backgroundColor: booking.staffColor }}
              >
                <Info className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  Thông tin đặt phòng: 
                  {isEditing ? (
                    <select
                      value={editForm.roomId || ''}
                      onChange={(e) => setEditForm({ ...editForm, roomId: e.target.value })}
                      className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded outline-none border border-indigo-200"
                    >
                      {(ROOMS_BY_HOMESTAY[booking.homestayId] || []).map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : (
                    <span>{booking.roomId}</span>
                  )}
                </h4>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-slate-500 flex items-center gap-1 uppercase tracking-wider font-bold">
                    Người nhập: <span className="text-indigo-600">{(booking.staffName || 'N/A').toUpperCase()}</span>
                  </p>
                  {booking.isEdited && (
                    <button 
                      onClick={() => setShowHistory(!showHistory)}
                      className="text-[10px] bg-amber-100 text-amber-700 font-black px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors uppercase"
                    >
                      Đã chỉnh sửa
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm col-span-full lg:col-span-1">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">NV Phụ trách</p>
                {isEditing ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {staffs.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setEditForm({ ...editForm, staffName: s.name, staffColor: s.color })}
                        className={cn(
                          "px-2 py-1 rounded text-[9px] font-black border transition-all flex items-center gap-1",
                          editForm.staffName === s.name
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-sm"
                            : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                        )}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }}></div>
                        {s.name}
                      </button>
                    ))}
                    <input 
                      type="text"
                      placeholder="Tên khác..."
                      value={!staffs.some(s => s.name === editForm.staffName) ? editForm.staffName || '' : ''}
                      onChange={(e) => setEditForm({ ...editForm, staffName: e.target.value })}
                      className="text-[9px] font-black text-slate-700 border-b border-indigo-200 focus:border-indigo-500 outline-none w-20 px-1"
                    />
                  </div>
                ) : (
                  <p className="text-xs font-black text-slate-700">{(booking.staffName || 'N/A').toUpperCase()}</p>
                )}
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Thời gian</p>
                {isEditing ? (
                  <div className="flex gap-2 bg-slate-50 p-2 rounded-xl mt-1 border border-slate-100">
                    <DateTimeTrigger 
                      label="Nhận"
                      date={editForm.checkIn?.toDate() || new Date()}
                      onChange={(d) => setEditForm({ ...editForm, checkIn: Timestamp.fromDate(d) })}
                    />
                    <div className="w-px h-8 bg-slate-200 self-end mb-2" />
                    <DateTimeTrigger 
                      label="Trả"
                      date={editForm.checkOut?.toDate() || new Date()}
                      referenceDate={editForm.checkIn?.toDate()}
                      align="right"
                      onChange={(d) => setEditForm({ ...editForm, checkOut: Timestamp.fromDate(d) })}
                    />
                  </div>
                ) : (
                  <p className="text-[10px] font-black text-slate-700">
                    {format(booking.checkIn.toDate(), 'HH:mm dd/MM')} - {format(booking.checkOut.toDate(), 'HH:mm dd/MM')}
                  </p>
                )}
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Doanh thu</p>
                {isEditing ? (
                  <input 
                    type="number"
                    value={editForm.price || 0}
                    onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                    className="w-full text-xs font-black text-indigo-600 border-b border-indigo-200 focus:border-indigo-500 outline-none"
                  />
                ) : (
                  <p className="text-xs font-black text-indigo-600">{booking.price.toLocaleString()} VNĐ</p>
                )}
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Thanh toán</p>
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, paymentStatus: 'Deposit' })}
                        className={cn(
                          "flex-1 py-1 text-[9px] font-black rounded transition-all",
                          editForm.paymentStatus === 'Deposit' 
                            ? "bg-amber-500 text-white shadow-sm" 
                            : "text-slate-400"
                        )}
                      >
                        Cọc
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, paymentStatus: 'Paid' })}
                        className={cn(
                          "flex-1 py-1 text-[9px] font-black rounded transition-all",
                          editForm.paymentStatus === 'Paid' 
                            ? "bg-emerald-500 text-white shadow-sm" 
                            : "text-slate-400"
                        )}
                      >
                        Hết
                      </button>
                    </div>
                    {editForm.paymentStatus === 'Deposit' && (
                      <input 
                        type="number"
                        placeholder="Tiền cọc..."
                        value={editForm.depositAmount || 0}
                        onChange={(e) => setEditForm({ ...editForm, depositAmount: Number(e.target.value) })}
                        className="w-full text-[10px] font-black text-amber-600 border-b border-amber-200 focus:border-amber-500 outline-none"
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded-full w-fit uppercase mb-0.5",
                      booking.paymentStatus === 'Deposit' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    )}>
                      {booking.paymentStatus === 'Deposit' ? 'Khách cọc' : 'Đã thanh toán'}
                    </span>
                    {booking.paymentStatus === 'Deposit' && (
                      <p className="text-[10px] font-black text-amber-600">Cọc: {booking.depositAmount?.toLocaleString()}đ</p>
                    )}
                  </div>
                )}
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-100 shadow-sm lg:col-span-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Trạng thái phòng</p>
                {isEditing ? (
                  <div className="flex bg-slate-50 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, status: 'Confirmed' })}
                      className={cn(
                        "flex-1 py-1 text-[9px] font-black rounded transition-all",
                        editForm.status !== 'Cancelled' 
                          ? "bg-indigo-600 text-white shadow-sm" 
                          : "text-slate-400"
                      )}
                    >
                      Bình thường
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, status: 'Cancelled' })}
                      className={cn(
                        "flex-1 py-1 text-[9px] font-black rounded transition-all",
                        editForm.status === 'Cancelled' 
                          ? "bg-rose-600 text-white shadow-sm" 
                          : "text-slate-400"
                      )}
                    >
                      Hủy/Bỏ cọc
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-full uppercase",
                      booking.status === 'Cancelled' ? "bg-rose-100 text-rose-700" : "bg-indigo-100 text-indigo-700"
                    )}>
                      {booking.status === 'Cancelled' ? 'Hủy bỏ/Bỏ cọc' : 'Bình thường'}
                    </span>
                    {booking.isEdited && (
                      <button 
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase hover:bg-amber-100 transition-all flex items-center gap-1 shadow-sm border border-amber-200"
                      >
                        <AlertCircle className="w-3 h-3" />
                        Lịch sử
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {showHistory && booking.history && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-4 p-3 bg-white rounded-xl border border-amber-100 space-y-2"
              >
                <p className="text-[10px] font-black text-amber-600 uppercase flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Lịch sử chỉnh sửa
                </p>
                <div className="max-h-40 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                  {booking.history.map((h, i) => (
                    <div key={i} className="text-[9px] p-2 bg-slate-50 rounded border border-slate-100 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="text-slate-400 font-bold w-full mb-1">Cập nhật lúc: {format(h.updatedAt.toDate(), 'HH:mm:ss dd/MM/yyyy')}</span>
                      <span className="text-slate-600">Phòng: <b className="text-slate-800">{h.roomId}</b></span>
                      <span className="text-slate-600">Thời gian: <b className="text-slate-800">{h.checkIn && format(h.checkIn.toDate(), 'HH:mm dd/MM')} - {h.checkOut && format(h.checkOut.toDate(), 'HH:mm dd/MM')}</b></span>
                      <span className="text-slate-600">Giá: <b className="text-slate-800">{h.price?.toLocaleString()}</b></span>
                      {h.paymentStatus === 'Deposit' && <span className="text-amber-600">Cọc: <b className="text-amber-800">{h.depositAmount?.toLocaleString()}</b></span>}
                      <span className="text-slate-600">NV: <b className="text-slate-800">{h.staffName?.toUpperCase()}</b></span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>

          <div className="flex md:flex-col gap-2 justify-center md:border-l md:border-slate-200 md:pl-6 min-w-[140px]">
            {isEditing ? (
              <>
                <button 
                  onClick={() => setConfirmEdit(true)}
                  className="flex-1 md:flex-none flex items-center gap-2 justify-center py-2 px-4 bg-emerald-600 text-white rounded-xl text-[11px] font-bold hover:bg-emerald-700 transition-all shadow-md active:scale-95"
                >
                  Lưu thay đổi
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex-1 md:flex-none flex items-center gap-2 justify-center py-2 px-4 bg-white text-slate-500 border border-slate-200 rounded-xl text-[11px] font-bold hover:bg-slate-50 transition-all active:scale-95"
                >
                  Hủy
                </button>
              </>
            ) : (
              <>
                <button 
                  disabled={!canModify}
                  onClick={() => setIsEditing(true)}
                  className="flex-1 md:flex-none flex items-center gap-2 justify-center py-2 px-4 bg-slate-900 text-white rounded-xl text-[11px] font-bold hover:bg-slate-800 transition-all shadow-md active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Chỉnh sửa
                </button>
                <button 
                  disabled={!canModify}
                  onClick={() => setConfirmDelete(true)}
                  className="flex-1 md:flex-none flex items-center gap-2 justify-center py-2 px-4 bg-white text-rose-600 border border-rose-100 rounded-xl text-[11px] font-bold hover:bg-rose-50 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa bỏ
                </button>
                {!canModify && (
                  <p className="text-[8px] font-bold text-rose-500 text-center uppercase tracking-tighter">Không có quyền sửa</p>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>

      <ConfirmDialog 
        isOpen={confirmDelete}
        type="delete"
        title="Xác nhận xóa đặt phòng?"
        description="Hành động này không thể hoàn tác. Dữ liệu đặt phòng sẽ bị xóa vĩnh viễn khỏi hệ thống."
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog 
        isOpen={confirmEdit}
        type="edit"
        title="Xác nhận sửa thông tin?"
        description="Bạn có chắc chắn muốn thay đổi thông tin đặt phòng này không?"
        onConfirm={handleEdit}
        onCancel={() => setConfirmEdit(false)}
      />
    </>
  );
}

/**
 * Chart 1: Monthly View
 * Horizontal: Days of month
 * Vertical: Rooms
 * Colors: White (empty), Red (full day), Yellow (partial)
 */
export function MonthlyChart({ bookings, staffs, homestayId, selectedDate, userRole, onDateSelect }: ChartProps) {
  const now = new Date();
  const rooms = ROOMS_BY_HOMESTAY[homestayId] || [];
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const [zoom, setZoom] = React.useState(1);
  const touchState = React.useRef<{ initialDistance: number; initialZoom: number } | null>(null);

  const showTotals = userRole !== 'staff' && userRole !== undefined; // Effectively admin or creator or anyone else non-staff

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      touchState.current = { initialDistance: dist, initialZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState.current && scrollRef.current) {
      if (e.cancelable) e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      
      const factor = dist / touchState.current.initialDistance;
      const newZoom = Math.min(Math.max(touchState.current.initialZoom * factor, 0.2), 3);
      
      if (newZoom !== zoom) {
        const scrollContainer = scrollRef.current;
        const currentZoom = zoom;
        const scrollLeft = scrollContainer.scrollLeft;
        const clientWidth = scrollContainer.clientWidth;
        
        // Calculate the relative center before zoom change
        // We exclude the sticky sidebar from the relative calculation for better precision
        const sidebarWidth = window.innerWidth < 1024 ? 48 : 64; // w-12 or w-16
        const contentScrollLeft = Math.max(0, scrollLeft);
        const centerOffset = contentScrollLeft + clientWidth / 2;
        
        setZoom(newZoom);
        
        // Use requestAnimationFrame or a small timeout to adjust scroll after layout update
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            const newContentWidth = days.length * newZoom * 40;
            const oldContentWidth = days.length * currentZoom * 40;
            const ratio = newZoom / currentZoom;
            
            // New scroll left to keep the same content under the center
            const newCenterOffset = centerOffset * ratio;
            scrollRef.current.scrollLeft = newCenterOffset - clientWidth / 2;
          }
        });
      }
    }
  };

  const handleTouchEnd = () => {
    touchState.current = null;
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [selectedBookingInternal, setSelectedBookingInternal] = React.useState<Booking | null>(null);

  const selectedBooking = React.useMemo(() => {
    if (!selectedBookingInternal) return null;
    return bookings.find(b => b.id === selectedBookingInternal.id) || null;
  }, [bookings, selectedBookingInternal]);

  React.useEffect(() => {
    if (scrollRef.current) {
      const today = new Date();
      if (isSameDay(startOfMonth(today), startOfMonth(selectedDate))) {
        const dayIndex = today.getDate() - 1;
        const dayWidth = zoom * 40;
        const sidebarWidth = window.innerWidth < 640 ? 40 : (window.innerWidth < 1024 ? 48 : 64); // even smaller for mobile
        const containerWidth = scrollRef.current.offsetWidth;
        const scrollPos = (dayIndex * dayWidth) + sidebarWidth - (containerWidth / 2) + (dayWidth / 2);
        scrollRef.current.scrollLeft = scrollPos;
      }
    }
  }, [selectedDate]); // Removed zoom

  const getRoomMonthlyTotal = (roomId: string) => {
    return bookings
      .filter(b => 
        b.roomId === roomId && 
        b.homestayId === homestayId && 
        b.checkIn.toDate() >= monthStart && 
        b.checkIn.toDate() <= monthEnd
      )
      .reduce((sum, b) => {
        if (b.status === 'Cancelled') {
          return sum + (b.depositAmount || 0);
        }
        return sum + b.price;
      }, 0);
  };

  const getCancelledDepositsTotal = () => {
    return bookings
      .filter(b => 
        b.homestayId === homestayId && 
        b.status === 'Cancelled' &&
        b.checkIn.toDate() >= monthStart &&
        b.checkIn.toDate() <= monthEnd
      )
      .reduce((sum, b) => sum + (b.depositAmount || 0), 0);
  };

  const getDayTotal = (day: Date) => {
    return bookings
      .filter(b => 
        b.homestayId === homestayId && 
        isSameDay(b.checkIn.toDate(), day)
      )
      .reduce((sum, b) => {
        if (b.status === 'Cancelled') {
          return sum + (b.depositAmount || 0);
        }
        return sum + b.price;
      }, 0);
  };

  const getOccupancyData = (day: Date, roomId: string) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    const roomBookings = bookings.filter(b => 
      b.roomId === roomId && 
      b.homestayId === homestayId && 
      b.status !== 'Cancelled'
    );
    
    let totalMinutes = 0;
    let deletedStaffMinutes = 0;

    roomBookings.forEach(b => {
      const CLEANING_BUFFER = 30 * 60 * 1000;
      const checkIn = b.checkIn.toDate();
      const checkOut = new Date(b.checkOut.toDate().getTime() + CLEANING_BUFFER);

      const overlapStart = checkIn > dayStart ? checkIn : dayStart;
      const overlapEnd = checkOut < dayEnd ? checkOut : dayEnd;

      if (overlapStart < overlapEnd) {
        const minutes = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60);
        totalMinutes += minutes;
        
        const isStaffActive = staffs.some(s => s.name === b.staffName);
        if (!isStaffActive && b.staffName) {
          deletedStaffMinutes += minutes;
        }
      }
    });

    const totalHours = totalMinutes / 60;
    const isMainlyDeleted = totalMinutes > 0 && deletedStaffMinutes / totalMinutes > 0.5;
    
    let color = 'bg-white';
    if (totalHours >= 18) color = 'bg-rose-500'; 
    else if (totalHours >= 8) color = 'bg-amber-400';
    else if (totalHours > 0) color = 'bg-emerald-500';

    return { color, hours: totalHours, isMainlyDeleted };
  };

  return (
    <div 
      ref={scrollRef} 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: 'pan-x pan-y' }}
      className="overflow-x-auto bg-white rounded-xl border border-slate-200 shadow-sm scrollbar-none scroll-smooth"
    >
      <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white sticky left-0">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Biểu đồ tháng {format(selectedDate, 'MM/yyyy')}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Phóng to:</span>
            <input 
              type="range" min="0.2" max="3" step="0.1" value={zoom} 
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-[10px] font-medium text-slate-500">
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-white border border-slate-200"></div> Trống</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-px"></div> Thấp</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-400 rounded-px"></div> Trung bình</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 rounded-px"></div> Cao</div>
        </div>
      </div>
      <div className="min-w-max">
        <div className="flex border-b border-slate-100 italic">
          <div className="w-10 lg:w-16 flex-shrink-0 bg-white text-[10px] font-bold p-1 sm:p-2 sticky left-0 z-30 text-slate-400 uppercase tracking-wider border-r border-slate-200">
            Phòng
          </div>
          <div className="flex-1 flex">
            {days.map(d => (
              <div 
                key={d.toString()} 
                style={{ width: `${zoom * 40}px` }}
                className="text-center text-[10px] font-bold py-2 border-r border-slate-100 bg-slate-50 text-slate-500 shrink-0"
              >
                {format(d, 'd')}
              </div>
            ))}
          </div>
          {showTotals && (
            <div className="w-24 flex-shrink-0 bg-slate-100 text-[10px] font-bold p-2 text-indigo-600 uppercase tracking-wider border-l border-slate-200 sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
              Tổng Tháng
            </div>
          )}
        </div>
        {rooms.map(room => (
          <div key={room} className="flex border-b border-slate-100 group min-h-[32px] sm:min-h-[40px] md:min-h-[50px]">
            <div className="w-10 lg:w-16 flex-shrink-0 bg-white/95 text-[9px] sm:text-[11px] p-1 sticky left-0 z-30 font-black text-slate-900 pointer-events-none flex items-center justify-center border-r border-slate-100/50">
              <span>{room}</span>
            </div>
            <div className="flex-1 flex relative">
              {/* Visual Lines layer for Monthly Chart */}
              <div className="absolute inset-0 pointer-events-none z-20 flex">
                {days.map(day => (
                  <div 
                    key={day.toString() + '-line'} 
                    style={{ width: `${zoom * 40}px` }}
                    className="h-full border-r border-slate-200/30 shrink-0" 
                  />
                ))}
              </div>
              
              <div className="flex relative z-0">
                {days.map(day => {
                  const { color, hours, isMainlyDeleted } = getOccupancyData(day, room);
                  const heightPercent = Math.min((hours / 24) * 100, 100);
                  const isPastDay = endOfDay(day) < now;
                  
                  return (
                    <div 
                      key={day.toString()} 
                      onClick={() => {
                        const dayStart = startOfDay(day);
                        const dayEnd = endOfDay(day);
                        const booking = bookings.find(b => 
                          b.roomId === room && 
                          b.homestayId === homestayId && 
                          b.status !== 'Cancelled' &&
                          ((b.checkIn.toDate() < dayEnd && b.checkOut.toDate() > dayStart))
                        );
                        if (booking) {
                          setSelectedBookingInternal(booking);
                        } else {
                          onDateSelect?.(format(day, 'yyyy-MM-dd'));
                        }
                      }}
                      style={{ width: `${zoom * 40}px` }}
                      className="h-6 sm:h-8 lg:h-10 border-r border-slate-100 flex items-end p-[1px] cursor-pointer bg-white shrink-0"
                      title={`${room} - ${format(day, 'dd/MM')}: ${hours.toFixed(1)}h${isMainlyDeleted ? ' (Nhân viên đã nghỉ)' : ''}`}
                    >
                      {hours > 0 && (
                        <motion.div 
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPercent}%` }}
                          className={cn(
                            "w-full transition-colors duration-500 rounded-[1px]", 
                            color,
                            (isMainlyDeleted || isPastDay) && "grayscale opacity-40 shadow-inner"
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {showTotals && (
              <div className="w-24 flex-shrink-0 flex items-center justify-end px-3 text-[11px] font-black text-indigo-600 bg-indigo-50/90 backdrop-blur-sm border-l border-slate-200 sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                {getRoomMonthlyTotal(room).toLocaleString()}
              </div>
            )}
          </div>
        ))}
        {/* Summary Row */}
        {showTotals && (
          <div className="flex bg-slate-900 text-white font-bold sticky bottom-0 z-10">
            <div className="w-10 sm:w-12 lg:w-16 flex-shrink-0 p-1 sm:p-2 text-[8px] sm:text-[9px] uppercase border-r border-slate-700 bg-slate-800 flex flex-col justify-center">
              <div>Tổng</div>
              {getCancelledDepositsTotal() > 0 && (
                <div className="text-[6px] sm:text-[7px] text-rose-400 mt-1">Cọc: {getCancelledDepositsTotal().toLocaleString()}</div>
              )}
            </div>
            <div className="flex-1 flex overflow-x-hidden">
              {days.map(day => {
                const dayTotal = getDayTotal(day);
                return (
                  <div 
                    key={`total-${day}`} 
                    style={{ width: `${zoom * 40}px` }}
                    className="flex items-center justify-center border-r border-slate-700 h-10 shrink-0"
                    title={`Tổng ngày ${format(day, 'dd/MM')}: ${dayTotal.toLocaleString()} VNĐ`}
                  >
                    {dayTotal > 0 && (
                      <div className="text-[7px] text-emerald-400 rotate-90 whitespace-nowrap">
                        {dayTotal >= 1000000 ? `${(dayTotal/1000000).toFixed(1)}M` : `${(dayTotal/1000).toFixed(0)}k`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="w-24 flex-shrink-0 flex flex-col items-end justify-center px-3 bg-emerald-600 text-white sticky right-0 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
              <div className="text-[11px] leading-tight">{rooms.reduce((sum, r) => sum + getRoomMonthlyTotal(r), 0).toLocaleString()}</div>
              {getCancelledDepositsTotal() > 0 && <div className="text-[7px] opacity-80">(Gồm {getCancelledDepositsTotal().toLocaleString()} cọc hủy)</div>}
            </div>
          </div>
        )}
      </div>

      {/* Booking Detail Panel */}
      <AnimatePresence>
        {selectedBooking && (
          <BookingDetailPanel 
            booking={selectedBooking}
            staffs={staffs}
            allBookings={bookings}
            userRole={userRole}
            onClose={() => setSelectedBookingInternal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Chart 2 & 3: Hourly View
 * 24 hours for each day
 */
export function HourlyChart({ 
  bookings, 
  staffs,
  homestayId, 
  selectedDate, 
  userRole,
  daysCount = 1, 
  isQuickAddMode,
  onQuickAdd
}: ChartProps & { 
  daysCount?: number;
  isQuickAddMode?: boolean;
  onQuickAdd?: (data: { roomId: string; checkIn: Date; checkOut: Date }) => void;
}) {
  const [now, setNow] = React.useState(new Date());
  
  React.useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const rooms = ROOMS_BY_HOMESTAY[homestayId] || [];
  const days = Array.from({ length: daysCount }, (_, i) => addDays(selectedDate, i));
  const [zoom, setZoom] = React.useState(1);
  const touchState = React.useRef<{ initialDistance: number; initialZoom: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      touchState.current = { initialDistance: dist, initialZoom: zoom };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchState.current && scrollRef.current) {
      if (e.cancelable) e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      
      const factor = dist / touchState.current.initialDistance;
      const newZoom = Math.min(Math.max(touchState.current.initialZoom * factor, 0.2), 4);
      
      if (newZoom !== zoom) {
        const scrollContainer = scrollRef.current;
        const currentZoom = zoom;
        const scrollLeft = scrollContainer.scrollLeft;
        const clientWidth = scrollContainer.clientWidth;
        
        // Calculate the relative center position including sidebar offset
        const sidebarWidth = window.innerWidth < 1024 ? 48 : 64; // Approx sidebar width
        const centerOffset = scrollLeft + clientWidth / 2;
        
        setZoom(newZoom);
        
        requestAnimationFrame(() => {
          if (scrollRef.current) {
            const ratio = newZoom / currentZoom;
            const newCenterOffset = centerOffset * ratio;
            scrollRef.current.scrollLeft = newCenterOffset - clientWidth / 2;
          }
        });
      }
    }
  };

  const handleTouchEnd = () => {
    touchState.current = null;
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [selectedBookingInternal, setSelectedBookingInternal] = React.useState<Booking | null>(null);
  
  // Selection state for quick add
  const [firstPoint, setFirstPoint] = React.useState<{ room: string; index: number } | null>(null);
  const [hoverPoint, setHoverPoint] = React.useState<{ room: string; index: number } | null>(null);

  const selection = React.useMemo(() => {
    if (!firstPoint || !hoverPoint || firstPoint.room !== hoverPoint.room) return null;
    return {
      room: firstPoint.room,
      start: Math.min(firstPoint.index, hoverPoint.index),
      end: Math.max(firstPoint.index, hoverPoint.index)
    };
  }, [firstPoint, hoverPoint]);

  const selectedBooking = React.useMemo(() => {
    if (!selectedBookingInternal) return null;
    return bookings.find(b => b.id === selectedBookingInternal.id) || null;
  }, [bookings, selectedBookingInternal]);

  // Total slots (e.g., 144 for 3 days - 30 min each)
  const totalSlots = daysCount * 48;
  const timeSlots = Array.from({ length: totalSlots }, (_, i) => i);
  const slotWidth = 20 * zoom; // 20px per 30 mins (approx)
  const totalWidth = totalSlots * slotWidth;

  // Calculate current time indicator position
  const startTime = startOfDay(selectedDate);
  const endTime = addDays(startTime, daysCount);

  const handleCellClick = (room: string, slotIndex: number) => {
    if (!isQuickAddMode) return;

    if (!firstPoint) {
      setFirstPoint({ room, index: slotIndex });
      setHoverPoint({ room, index: slotIndex });
    } else {
      if (firstPoint.room !== room) {
        setFirstPoint({ room, index: slotIndex });
        setHoverPoint({ room, index: slotIndex });
        return;
      }

      const startIdx = Math.min(firstPoint.index, slotIndex);
      const endIdx = Math.max(firstPoint.index, slotIndex) + 1; // +1 to include the end slot

      const checkIn = new Date(startTime.getTime() + startIdx * 30 * 60 * 1000);
      const checkOut = new Date(startTime.getTime() + endIdx * 30 * 60 * 1000);

      if (onQuickAdd) {
        onQuickAdd({
          roomId: room,
          checkIn,
          checkOut
        });
      }
      
      setFirstPoint(null);
      setHoverPoint(null);
    }
  };

  const handleMouseEnterCell = (room: string, slotIndex: number) => {
    if (!isQuickAddMode) return;
    setHoverPoint({ room, index: slotIndex });
  };

  const diffInSlots = (now.getTime() - startTime.getTime()) / (1000 * 60 * 30);
  const showIndicator = diffInSlots >= 0 && diffInSlots < totalSlots;
  const sidebarWidth = typeof window !== 'undefined' ? (window.innerWidth < 640 ? 40 : (window.innerWidth < 1024 ? 48 : 64)) : 64;
  const indicatorLeft = (diffInSlots * slotWidth) + sidebarWidth + 1; // (slots * width) + sidebar + adjustment for border

  React.useEffect(() => {
    if (scrollRef.current && showIndicator) {
      const containerWidth = scrollRef.current.offsetWidth;
      const scrollPos = indicatorLeft - (containerWidth / 2);
      scrollRef.current.scrollLeft = scrollPos;
    }
  }, [selectedDate, daysCount]); // Replaced indicatorLeft with selectedDate and removed showIndicator to avoid zoom-triggered recentering

  const getRoomBookings = (roomId: string) => {
    return bookings.filter(b => {
      if (b.roomId !== roomId || b.homestayId !== homestayId) return false;
      const checkIn = b.checkIn.toDate();
      const checkOut = b.checkOut.toDate();
      // Overlap with chart range
      return (checkIn < endTime && checkOut > startTime);
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/30">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Lịch trình {daysCount} ngày ({format(days[0], 'dd/MM')} - {format(days[days.length - 1], 'dd/MM')})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase">Phóng to:</span>
            <input 
              type="range" min="0.2" max="4" step="0.1" value={zoom} 
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-24 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold uppercase tracking-tight">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></div> <span className="text-emerald-600">Đã thanh toán</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-amber-500 rounded-sm"></div> <span className="text-amber-600">Khách cọc</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-rose-500 rounded-sm"></div> <span className="text-rose-600">Bỏ cọc/Hủy</span></div>
        </div>
      </div>

      <div 
        ref={scrollRef} 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'pan-x pan-y' }}
        className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 p-4 relative scroll-smooth"
      >
        <div className="min-w-max relative">
          {/* Now Indicator Line */}
          {showIndicator && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-20 shadow-[0_0_8px_rgba(244,63,94,0.5)] pointer-events-none"
              style={{ left: `${indicatorLeft}px` }}
            >
              <div className="absolute -top-1 -left-[3px] w-2 h-2 rounded-full bg-rose-500" />
            </motion.div>
          )}

          {/* Day Headers */}
          <div className="flex">
            <div className="w-10 lg:w-16 shrink-0"></div>
            <div className="flex-1 flex border-l border-slate-200">
              {days.map((day, idx) => (
                <div 
                  key={day.toString()} 
                  style={{ width: `${48 * slotWidth}px` }}
                  className={cn(
                    "text-center py-1 border-r border-slate-200 bg-slate-50/50 text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0",
                    idx < days.length - 1 && "border-r-slate-800 border-r-2"
                  )}
                >
                  Ngày {format(day, 'dd/MM')}
                </div>
              ))}
            </div>
          </div>

          {/* Time Labels (48 slots per day) */}
          <div className="flex mb-1">
            <div className="w-10 lg:w-16 shrink-0"></div>
            <div className="flex-1 flex border-l border-slate-200">
              {days.map((day, idx) => (
                <div 
                  key={`labels-${day}`} 
                  style={{ width: `${48 * slotWidth}px` }}
                  className={cn(
                    "flex shrink-0",
                    idx < days.length - 1 && "border-r-slate-800 border-r-2"
                  )}
                >
                  {Array.from({ length: 48 }).map((_, i) => {
                    const hour = Math.floor(i / 2);
                    const isHourMark = i % 2 === 0;
                    return (
                      <div 
                        key={i} 
                        style={{ width: `${slotWidth}px` }}
                        className={cn(
                          "shrink-0 flex flex-col items-start justify-end h-7 pb-1 relative",
                          isHourMark ? "border-l border-slate-400" : "border-l border-slate-200/40"
                        )}
                      >
                        {isHourMark && (
                          <span className="text-[8px] font-black text-slate-500 absolute -translate-x-1/2 left-0 -top-1 bg-white/80 px-0.5 rounded">
                            {hour}h
                          </span>
                        )}
                        <div className={cn("w-px h-1 bg-slate-300 mt-auto", isHourMark && "bg-slate-500 h-2")}></div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          
          {/* Room Rows */}
          {rooms.map(room => {
            const roomBookings = getRoomBookings(room);
            return (
              <div key={room} className="flex items-center group h-8 sm:h-10 border-b border-slate-50 last:border-0 hover:bg-slate-50/10 transition-colors">
                <div className="w-10 lg:w-16 shrink-0 sticky left-0 z-30 bg-white/95 px-1 sm:px-2 font-black text-[9px] sm:text-[11px] text-slate-900 h-full flex items-center pointer-events-none justify-center border-r border-slate-100">
                  <span>{room}</span>
                </div>
                <div className="flex-1 flex relative h-full border-l border-slate-200">
                  {/* Grid Lines Overlay - Purely visual, sits above bookings */}
                  <div className="absolute inset-0 pointer-events-none z-20 flex">
                    {timeSlots.map(index => {
                        const isLastInDay = (index + 1) % 48 === 0;
                        const isHourMark = (index + 1) % 2 === 0;
                        return (
                          <div 
                            key={index} 
                            style={{ width: `${slotWidth}px` }}
                            className={cn(
                              "h-full shrink-0 border-r transition-colors",
                              isHourMark ? "border-slate-300" : "border-slate-100/50",
                              isLastInDay && index < totalSlots - 1 && "border-slate-800 border-r-2",
                            )}
                          />
                        );
                    })}
                  </div>

                  {/* Interaction Layer & Selection Highlight */}
                  {timeSlots.map(index => {
                      const isSelected = selection && 
                                        selection.room === room && 
                                        index >= selection.start && 
                                        index <= selection.end;
                      
                      const isFirst = firstPoint && firstPoint.room === room && firstPoint.index === index;
                      
                      return (
                        <div 
                          key={index} 
                          onClick={() => handleCellClick(room, index)}
                          onMouseEnter={() => handleMouseEnterCell(room, index)}
                          style={{ width: `${slotWidth}px` }}
                          className={cn(
                            "h-full shrink-0 transition-all relative z-0",
                            isSelected ? "bg-amber-400/60 ring-1 ring-amber-500 ring-inset" : "hover:bg-slate-200/50",
                            isFirst && !isSelected && "bg-amber-200 ring-1 ring-amber-400 ring-inset",
                            isQuickAddMode && "cursor-crosshair"
                          )}
                        />
                      );
                  })}

                  {/* Overlaid Bookings */}
                  {roomBookings.map(booking => {
                    const checkIn = booking.checkIn.toDate();
                    const checkOut = booking.checkOut.toDate();
                    
                    const startSlot = (checkIn.getTime() - startTime.getTime()) / (1000 * 60 * 30);
                    const endSlot = (checkOut.getTime() - startTime.getTime()) / (1000 * 60 * 30);
                    
                    const left = Math.max(0, startSlot * slotWidth);
                    const width = (Math.min(totalSlots, endSlot) - Math.max(0, startSlot)) * slotWidth;

                    const isSelected = selectedBooking?.id === booking.id;
                    const isStaffActive = staffs.some(s => s.name === booking.staffName);
                    const isPast = checkOut < now;
                    const durationHours = (booking.checkOut.toDate().getTime() - booking.checkIn.toDate().getTime()) / (1000 * 60 * 60);

                    const getBookingBgColor = () => {
                      if (booking.status === 'Cancelled') return '#f43f5e'; // rose-500
                      if (booking.paymentStatus === 'Paid') return '#10b981'; // emerald-500
                      if (booking.paymentStatus === 'Deposit') return '#f59e0b'; // amber-500
                      return '#6366f1'; // default
                    };

                    return (
                      <React.Fragment key={booking.id}>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={cn(
                            "absolute border-x border-white/20 shadow-sm flex flex-col items-center justify-center overflow-hidden cursor-pointer transition-all hover:brightness-110 px-0.5",
                            booking.status === 'Cancelled' ? "h-1/2 bottom-0 top-auto z-5 opacity-80" : "h-full top-0 z-10",
                            isSelected && "ring-2 ring-white ring-inset shadow-lg scale-[1.02] z-20",
                            (!isStaffActive && booking.staffName) || isPast ? "grayscale opacity-60 contrast-[0.8]" : ""
                          )}
                          onClick={() => setSelectedBookingInternal(booking)}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{ 
                            left: `${left}px`, 
                            width: `${width}px`,
                            backgroundColor: getBookingBgColor()
                          }}
                          title={`${room} - ${format(checkIn, 'HH:mm')} to ${format(checkOut, 'HH:mm')} (${booking.staffName?.toUpperCase()}${!isStaffActive && booking.staffName ? ' - Đã xóa' : ''}) - ${durationHours.toFixed(1)}h - ${booking.price?.toLocaleString()}đ`}
                        >
                           <span className={cn(
                             "text-[7px] font-black text-white uppercase whitespace-nowrap opacity-80 truncate w-full text-center transition-opacity leading-tight",
                             isSelected && "opacity-100",
                             !isStaffActive && booking.staffName && "italic",
                             booking.status === 'Cancelled' && "text-[6px]"
                           )}>
                             {booking.staffName?.toUpperCase()}
                           </span>
                           {booking.status !== 'Cancelled' && (
                             <span className="text-[6px] font-bold text-white/90 whitespace-nowrap opacity-90 truncate w-full text-center leading-tight">
                               {durationHours.toFixed(1)}h | {booking.price?.toLocaleString()}
                             </span>
                           )}
                        </motion.div>
                        {/* Cleaning Buffer Visual */}
                        {booking.status !== 'Cancelled' && (endSlot < totalSlots) && (
                          <div 
                            className="absolute h-full top-0 z-[5] pointer-events-none"
                            style={{ 
                              left: `${left + width}px`, 
                              width: `${Math.min(slotWidth, (totalSlots - endSlot) * slotWidth)}px`,
                              background: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.03) 5px, rgba(0,0,0,0.03) 10px)',
                              borderRight: '1px dashed rgba(0,0,0,0.1)'
                            }}
                            title="Thời gian dọn dẹp (30p)"
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Booking Detail Panel */}
      <AnimatePresence>
        {selectedBooking && (
          <BookingDetailPanel 
            booking={selectedBooking}
            staffs={staffs}
            allBookings={bookings}
            userRole={userRole}
            onClose={() => setSelectedBookingInternal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
