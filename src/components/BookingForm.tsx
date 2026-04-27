import React, { useState } from 'react';
import { format } from 'date-fns';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError } from '../lib/error-handler';
import { ROOMS_BY_HOMESTAY, INITIAL_HOMESTAYS } from '../constants';
import { DateTimeTrigger } from './Pickers';
import { Plus, X, User as UserIcon, Palette } from 'lucide-react';
import { Booking, AuthProfile } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface BookingFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  selectedHomestay: { id: string; name: string };
  existingBookings: Booking[];
  initialDate?: string;
  quickAddData?: { roomId: string; checkIn: Date; checkOut: Date } | null;
  currentProfile: AuthProfile | null;
}

export default function BookingForm({ onSuccess, onCancel, selectedHomestay, existingBookings, initialDate, quickAddData, currentProfile }: BookingFormProps) {
  const [homestayId, setHomestayId] = useState(selectedHomestay.id);
  const [roomId, setRoomId] = useState(quickAddData?.roomId || ROOMS_BY_HOMESTAY[selectedHomestay.id][0]);
  const [checkInDate, setCheckInDate] = useState(
    quickAddData ? format(quickAddData.checkIn, 'yyyy-MM-dd') : (initialDate || '')
  );
  const [checkInTime, setCheckInTime] = useState(
    quickAddData ? format(quickAddData.checkIn, 'HH:mm') : '14:00'
  );
  const [checkOutDate, setCheckOutDate] = useState(
    quickAddData ? format(quickAddData.checkOut, 'yyyy-MM-dd') : (initialDate || '')
  );
  const [checkOutTime, setCheckOutTime] = useState(
    quickAddData ? format(quickAddData.checkOut, 'HH:mm') : '12:00'
  );
  const [price, setPrice] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Paid' | 'Deposit'>('Paid');
  const [loading, setLoading] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

  // Helper to parse shorthand prices: 199k -> 199000, 2tr1 -> 2100000, 300 -> 300000
  const parseVietnameseShorthandPrice = (input: string): number => {
    const cleanInput = input.toLowerCase().replace(/\s+/g, '').replace(/,/g, '');
    if (!cleanInput) return 0;

    // Handle "tr" (Millions)
    if (cleanInput.includes('tr')) {
      const [milPart, restPart] = cleanInput.split('tr');
      const millions = parseFloat(milPart || '0') * 1000000;
      let rest = 0;
      
      if (restPart) {
        if (restPart.includes('k')) {
          rest = parseFloat(restPart.replace('k', '')) * 1000;
        } else {
          const numStr = restPart.replace(/[^0-9]/g, '');
          if (numStr.length === 1) rest = parseInt(numStr) * 100000;
          else if (numStr.length === 2) rest = parseInt(numStr) * 10000;
          else if (numStr.length === 3) rest = parseInt(numStr) * 1000;
          else rest = parseInt(numStr);
        }
      }
      return millions + rest;
    }

    // Handle "k" (Thousands)
    if (cleanInput.endsWith('k')) {
      return parseFloat(cleanInput.replace('k', '')) * 1000;
    }

    const numericValue = parseFloat(cleanInput);
    if (isNaN(numericValue)) return 0;

    // If small numeric value, assume thousands (e.g. "300" -> 300,000)
    if (numericValue > 0 && numericValue < 1000) {
      return numericValue * 1000;
    }

    return numericValue;
  };

  const saveBooking = async (status: 'Paid' | 'Deposit') => {
    setLoading(true);
    try {
      const start = new Date(`${checkInDate}T${checkInTime}`);
      const end = new Date(`${checkOutDate}T${checkOutTime}`);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        alert('Vui lòng chọn thời gian hợp lệ');
        setLoading(false);
        return;
      }

      if (end <= start) {
        alert('Giờ trả phòng phải sau giờ nhận phòng');
        setLoading(false);
        return;
      }

      // Prevent past bookings for non-root admins or if specifically required
      if (start < new Date() && !['admin', 'creator'].includes(currentProfile?.role || '')) {
        alert('Không thể đặt phòng ở thời gian quá khứ');
        setLoading(false);
        return;
      }
      
      if (status === 'Deposit' && !depositAmount.trim()) {
        alert('Vui lòng nhập số tiền khách đã cọc');
        setLoading(false);
        return;
      }

      // Check for overlaps (including 30-minute cleaning buffer)
      const CLEANING_BUFFER = 30 * 60 * 1000; // 30 minutes in ms
      const hasOverlap = existingBookings.some(b => {
        if (b.homestayId !== homestayId || b.roomId !== roomId || b.status === 'Cancelled') return false;
        
        const bStart = b.checkIn.toDate().getTime();
        const bEnd = b.checkOut.toDate().getTime();
        
        const newStart = start.getTime();
        const newEnd = end.getTime();
        
        // Conflict if: New booking starts before Existing ends (+ buffer) 
        // AND Existing booking starts before New ends (+ buffer)
        return (newStart < bEnd + CLEANING_BUFFER) && (bStart < newEnd + CLEANING_BUFFER);
      });

      if (hasOverlap) {
        alert(`Trùng lịch! Phòng ${roomId} đã có khách hoặc đang trong thời gian dọn dẹp (30p sau mỗi lịch).`);
        setLoading(false);
        return;
      }

      const staffName = currentProfile?.username?.toUpperCase() || auth.currentUser?.email?.split('@')[0].toUpperCase() || 'UNKNOWN';

      await addDoc(collection(db, 'bookings'), {
        homestayId,
        roomId,
        checkIn: Timestamp.fromDate(start),
        checkOut: Timestamp.fromDate(end),
        price: parseVietnameseShorthandPrice(price),
        depositAmount: status === 'Deposit' ? parseVietnameseShorthandPrice(depositAmount) : 0,
        paymentStatus: status,
        userId: auth.currentUser?.uid || 'guest',
        staffName: staffName,
        staffColor: '#6366f1',
      }).catch(err => {
        handleFirestoreError(err, 'create', 'bookings');
      });
      onSuccess();
    } catch (error: any) {
      console.error('Error adding booking:', error);
      alert('Lỗi: ' + (error.message || 'Không thể lưu đặt phòng'));
    } finally {
      setLoading(false);
    }
  };

  const currentRooms = ROOMS_BY_HOMESTAY[homestayId] || [];

  return (
    <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
      <div className="flex justify-between items-center mb-5">
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-900 flex items-center gap-2">
          <Plus className="w-3.5 h-3.5 text-indigo-600" />
          Ghi chú đặt phòng
        </h2>
        <button onClick={onCancel} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Cơ sở</label>
            <select
              value={homestayId}
              onChange={(e) => {
                setHomestayId(e.target.value);
                setRoomId(ROOMS_BY_HOMESTAY[e.target.value][0]);
              }}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500/50 outline-none font-bold text-slate-700"
            >
              {INITIAL_HOMESTAYS.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Phòng</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500/50 outline-none font-bold text-slate-700"
            >
              {currentRooms.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <UserIcon className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Người thực hiện</p>
              <p className="text-sm font-black text-slate-900 tracking-tight">
                {(currentProfile?.username || auth.currentUser?.email?.split('@')[0])?.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
        </div>

        <div className="flex gap-4 p-4 rounded-3xl bg-slate-50 border border-slate-100 shadow-inner mb-4">
          <DateTimeTrigger 
            label="Nhận phòng"
            date={new Date(`${checkInDate}T${checkInTime}`)}
            onChange={(d) => {
              setCheckInDate(format(d, 'yyyy-MM-dd'));
              setCheckInTime(format(d, 'HH:mm'));
            }}
          />
          <div className="w-px h-10 bg-slate-200 self-end mb-3" />
          <DateTimeTrigger 
            label="Trả phòng"
            date={new Date(`${checkOutDate}T${checkOutTime}`)}
            referenceDate={new Date(`${checkInDate}T${checkInTime}`)}
            align="right"
            onChange={(d) => {
              setCheckOutDate(format(d, 'yyyy-MM-dd'));
              setCheckOutTime(format(d, 'HH:mm'));
            }}
          />
        </div>

        <div className="space-y-1.5 pt-2">
          <label className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 flex justify-between items-center">
            Tổng thanh toán (VNĐ)
            {price && (
              <span className="text-indigo-600 font-black text-[10px] bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                {parseVietnameseShorthandPrice(price).toLocaleString()}đ
              </span>
            )}
          </label>
          <input
            type="text"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full p-4 bg-indigo-600/5 border-2 border-indigo-100 rounded-2xl text-xl font-black text-indigo-900 placeholder:text-indigo-200 focus:ring-0 focus:border-indigo-500 outline-none text-center"
            placeholder="199k, 2tr1, 300..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowDepositModal(true)}
            className="py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg bg-white border-2 border-amber-100 text-amber-600 hover:bg-amber-50"
          >
            {loading && paymentStatus === 'Deposit' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Khách cọc'}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setPaymentStatus('Paid');
              saveBooking('Paid');
            }}
            className="py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg bg-emerald-500 text-white shadow-emerald-100 hover:bg-emerald-600"
          >
           {loading && paymentStatus === 'Paid' ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Đã thanh toán'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showDepositModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border border-slate-100"
            >
              <div className="mb-6 text-center">
                <div className="w-16 h-16 bg-amber-50 rounded-[24px] flex items-center justify-center mx-auto mb-4 border-2 border-white shadow-sm">
                  <Palette className="w-8 h-8 text-amber-500" />
                </div>
                <h3 className="text-xl font-black text-slate-900">Xác nhận cọc</h3>
                <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Ghi nhận tiền khách đã cọc</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="px-1 text-[10px] font-black uppercase tracking-widest text-amber-600 flex justify-between">
                    Số tiền khách cọc
                    {depositAmount && (
                      <span className="text-amber-900">
                        {parseVietnameseShorthandPrice(depositAmount).toLocaleString()}đ
                      </span>
                    )}
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setPaymentStatus('Deposit');
                        saveBooking('Deposit');
                      }
                    }}
                    className="w-full p-5 bg-amber-50 border-2 border-amber-100 rounded-[24px] text-2xl font-black text-amber-900 placeholder:text-amber-200 focus:ring-0 focus:border-amber-400 outline-none text-center transition-all"
                    placeholder="100k, 200..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowDepositModal(false)}
                    className="flex-1 py-4 text-xs font-black text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
                  >
                    Hủy
                  </button>
                  <button 
                    disabled={loading || !depositAmount.trim()}
                    onClick={() => {
                      setPaymentStatus('Deposit');
                      saveBooking('Deposit');
                    }}
                    className="flex-[2] py-4 bg-amber-500 text-white text-xs font-black rounded-[20px] hover:bg-amber-600 transition-all shadow-xl shadow-amber-100 disabled:opacity-50 uppercase tracking-widest"
                  >
                    {loading ? 'Đang lưu...' : 'Xác nhận đặt'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
