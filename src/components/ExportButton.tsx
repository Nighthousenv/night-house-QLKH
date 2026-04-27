import React, { useState } from 'react';
import { Download, FileDown, Calendar as CalendarIcon, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import * as XLSX from 'xlsx';
import { Booking } from '../types';
import { INITIAL_HOMESTAYS, ROOMS_BY_HOMESTAY } from '../constants';
import { cn } from '../lib/utils';

interface ExportButtonProps {
  bookings: Booking[];
  staffs: any[];
}

export default function ExportButton({ bookings, staffs }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    try {
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

      const workbook = XLSX.utils.book_new();

      // 1. Revenue Table (By Homestay and Room)
      const revenueData: any[] = [];
      
      // Header row for days
      const dayHeaders = ['Cơ sở', 'Phòng', ...days.map(d => format(d, 'dd/MM')), 'Tổng cộng'];
      revenueData.push(dayHeaders);

      INITIAL_HOMESTAYS.forEach(hs => {
        const rooms = ROOMS_BY_HOMESTAY[hs.id] || [];
        let hsTotal = 0;
        const hsDayTotals = new Array(days.length).fill(0);

        rooms.forEach(room => {
          const rowData: any[] = [hs.name, room];
          let roomTotal = 0;

          days.forEach((day, idx) => {
            const dailyBookings = bookings.filter(b => 
              b.homestayId === hs.id && 
              b.roomId === room && 
              isSameDay(b.checkIn.toDate(), day) &&
              b.status !== 'Cancelled'
            );
            const amount = dailyBookings.reduce((sum, b) => sum + (b.price || 0), 0);
            rowData.push(amount || 0);
            roomTotal += amount;
            hsDayTotals[idx] += amount;
          });

          rowData.push(roomTotal);
          revenueData.push(rowData);
          hsTotal += roomTotal;
        });

        // Homestay Total Row
        const hsTotalRow = [`Tổng ${hs.name}`, '', ...hsDayTotals, hsTotal];
        revenueData.push(hsTotalRow);
      });

      const revenueSheet = XLSX.utils.aoa_to_sheet(revenueData);
      XLSX.utils.book_append_sheet(workbook, revenueSheet, 'Doanh thu phòng');

      // 2. Staff Table
      const staffList = [...staffs];
      // Include any staff names found in bookings but not in the staffs list (in case they were deleted but had data)
      const uniqueBookingStaffs = Array.from(new Set(bookings.map(b => b.staffName))).filter(Boolean);
      uniqueBookingStaffs.forEach(name => {
        if (!staffList.some(s => s.name === name)) {
          staffList.push({ name, id: `unknown-${name}`, color: '#94a3b8' });
        }
      });

      const staffData: any[] = [['Tên nhân viên', 'Ngày', 'Phòng', 'Cơ sở', 'Số tiền']];
      
      staffList.forEach(staff => {
        const staffBookings = bookings.filter(b => 
          b.staffName === staff.name && 
          b.checkIn.toDate() >= monthStart && 
          b.checkIn.toDate() <= monthEnd &&
          b.status !== 'Cancelled'
        ).sort((a, b) => a.checkIn.toMillis() - b.checkIn.toMillis());

        if (staffBookings.length > 0) {
          staffBookings.forEach(b => {
            const hsName = INITIAL_HOMESTAYS.find(h => h.id === b.homestayId)?.name || 'N/A';
            staffData.push([
              staff.name,
              format(b.checkIn.toDate(), 'dd/MM/yyyy'),
              b.roomId,
              hsName,
              b.price || 0
            ]);
          });

          const totalAmount = staffBookings.reduce((sum, b) => sum + (b.price || 0), 0);
          staffData.push([`TỔNG ${staff.name}`, '', '', `${staffBookings.length} bookings`, totalAmount]);
          staffData.push([]); // Empty row as separator
        }
      });

      const staffSheet = XLSX.utils.aoa_to_sheet(staffData);
      XLSX.utils.book_append_sheet(workbook, staffSheet, 'Phụ trách chi tiết');

      // Save file
      const fileName = `Bao_cao_Thang_${format(selectedMonth, 'MM-yyyy')}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      setIsOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Xuất dữ liệu thất bại. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-indigo-100 transition-all border border-indigo-100 shadow-sm"
      >
        <FileDown className="w-4 h-4" />
        <span className="hidden sm:inline">Xuất dữ liệu</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative z-10 border border-slate-100"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-50 rounded-2xl">
                    <FileDown className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Xuất dữ liệu Excel</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Chọn tháng xuất báo cáo</p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <button 
                      onClick={() => setSelectedMonth(prev => new Date(prev.setMonth(prev.getMonth() - 1)))}
                      className="p-2 hover:bg-white rounded-xl shadow-sm transition-all"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-400" />
                    </button>
                    <div className="text-center">
                      <span className="text-xs font-black text-slate-900 block">{format(selectedMonth, 'MMMM')}</span>
                      <span className="text-[10px] font-bold text-slate-400">{format(selectedMonth, 'yyyy')}</span>
                    </div>
                    <button 
                      onClick={() => setSelectedMonth(prev => new Date(prev.setMonth(prev.getMonth() + 1)))}
                      className="p-2 hover:bg-white rounded-xl shadow-sm transition-all"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>

                <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50">
                  <h4 className="text-[10px] font-black text-indigo-900 uppercase mb-2">Thông tin xuất:</h4>
                  <ul className="space-y-1.5">
                    <li className="text-[10px] text-indigo-700 flex items-center gap-2">
                       <div className="w-1 h-1 rounded-full bg-indigo-400" />
                       Biểu đồ doanh thu 3 cơ sở
                    </li>
                    <li className="text-[10px] text-indigo-700 flex items-center gap-2">
                       <div className="w-1 h-1 rounded-full bg-indigo-400" />
                       Chi tiết thu nhập nhân viên
                    </li>
                    <li className="text-[10px] text-indigo-700 flex items-center gap-2">
                       <div className="w-1 h-1 rounded-full bg-indigo-400" />
                       Tổng hợp số lượng khách
                    </li>
                  </ul>
                </div>

                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Tải xuống báo cáo
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
