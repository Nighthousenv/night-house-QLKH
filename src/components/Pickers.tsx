import React, { useRef, useEffect, useState, useMemo } from 'react';
import { cn } from '../lib/utils';
import { getDaysInMonth, format, isBefore } from 'date-fns';
import { Calendar } from 'lucide-react';

interface WheelPickerProps {
  options: (string | number)[];
  value: string | number;
  onChange: (value: string | number) => void;
  itemHeight?: number;
  className?: string;
}

export function WheelPicker({ options, value, onChange, itemHeight = 36, className }: WheelPickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isInternalScrolling, setIsInternalScrolling] = useState(false);
  const selectedIndex = options.indexOf(value);

  // Sync scroll position when value changes externally
  useEffect(() => {
    if (scrollRef.current && !isInternalScrolling) {
      scrollRef.current.scrollTop = selectedIndex * itemHeight;
    }
  }, [value, selectedIndex, itemHeight, isInternalScrolling]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const index = Math.round(container.scrollTop / itemHeight);
    
    // Safety check
    if (index < 0 || index >= options.length) return;
    
    const newValue = options[index];
    
    // Only fire onChange if value actually changed
    setIsInternalScrolling(true);
    const timeoutId = (window as any).wheelPickerTimeout;
    if (timeoutId) clearTimeout(timeoutId);
    
    (window as any).wheelPickerTimeout = setTimeout(() => {
      if (newValue !== value) {
        onChange(newValue);
      }
      setIsInternalScrolling(false);
    }, 100);
  };

  return (
    <div 
      className={cn("relative h-40 sm:h-48 w-11 sm:w-14 bg-slate-50 overflow-hidden border border-slate-200", className)}
      style={{ height: itemHeight * 5 }}
    >
      {/* Target area - Highlight bar */}
      <div 
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-indigo-600/10 pointer-events-none z-10"
        style={{ height: itemHeight }}
      />
      
      {/* Fading gradients */}
      <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-slate-50 to-transparent pointer-events-none z-20" />
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none z-20" />

      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scrollbar-none snap-y snap-mandatory"
        style={{ paddingBlock: itemHeight * 2 }}
      >
        {options.map((option, idx) => {
          const isSelected = option === value;
          return (
            <div 
              key={idx}
              className={cn(
                "snap-center flex items-center justify-center transition-all duration-300",
                isSelected ? "text-indigo-600 font-black text-[20px] opacity-100" : "text-slate-400 font-bold text-[14px]"
              )}
              style={{ height: itemHeight }}
            >
              {option.toString().padStart(2, '0')}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DateTimePickerProps {
  date: Date;
  onChange: (date: Date) => void;
  label?: string;
  isCheckOut?: boolean;
}

export function DateTimeWheelPicker({ date, onChange, label, isCheckOut }: DateTimePickerProps) {
  const day = date.getDate();
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  const hour = date.getHours();
  const minute = Math.floor(date.getMinutes() / 10) * 10;

  const daysInMonth = useMemo(() => getDaysInMonth(date), [date]);
  const daysOptions = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);
  const monthsOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const hoursOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutesOptions = [0, 10, 20, 30, 40, 50];

  const updateDate = (newDay: number, newMonth: number, newHour: number, newMinute: number) => {
    const d = new Date(year, newMonth - 1, newDay, newHour, newMinute);
    onChange(d);
  };

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
      {label && <div className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] px-4 py-2 bg-indigo-50/50 rounded-2xl mb-1 text-center">{label}</div>}
      
      <div className="flex items-center justify-center p-2 rounded-2xl bg-slate-50/50 border border-slate-100">
        {/* Time Part First */}
        <div className="flex items-center gap-0.5">
          <WheelPicker 
            options={hoursOptions} 
            value={hour} 
            onChange={(v) => updateDate(day, month, Number(v), minute)}
            className="rounded-2xl"
          />
          <div className="text-slate-300 font-black text-[12px] select-none mx-1">:</div>
          <WheelPicker 
            options={minutesOptions} 
            value={minute} 
            onChange={(v) => updateDate(day, month, hour, Number(v))}
            className="rounded-2xl"
          />
        </div>

        {/* Divider */}
        <div className="w-px h-16 bg-slate-200 mx-4" />

        {/* Date Part */}
        <div className="flex items-center gap-0.5">
          <WheelPicker 
            options={daysOptions} 
            value={day} 
            onChange={(v) => updateDate(Number(v), month, hour, minute)}
            className="rounded-2xl"
          />
          <div className="text-slate-300 font-black text-[12px] select-none mx-1">/</div>
          <WheelPicker 
            options={monthsOptions} 
            value={month} 
            onChange={(v) => updateDate(day, Number(v), hour, minute)}
            className="rounded-2xl"
          />
        </div>
      </div>
      
      <div className="mt-2 px-4 py-2 text-center text-[10px] font-bold text-slate-400 italic">
        {format(date, 'EEEE, dd/MM/yyyy', {  })}
      </div>
    </div>
  );
}

export function DateTimeTrigger({ date, label, onChange, referenceDate, align = 'left' }: DateTimePickerProps & { referenceDate?: Date, align?: 'left' | 'right' }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePickerChange = (newDate: Date) => {
    let finalDate = newDate;
    
    // Automatic year transition logic
    if (referenceDate) {
      const year = referenceDate.getFullYear();
      // Try current year
      const sameYear = new Date(newDate);
      sameYear.setFullYear(year);
      
      if (isBefore(sameYear, referenceDate)) {
        // If before reference date, assume it's the next year
        sameYear.setFullYear(year + 1);
      }
      finalDate = sameYear;
    }
    
    onChange(finalDate);
  };

  return (
    <div className="relative flex-1" ref={containerRef}>
      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1 px-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between p-3 rounded-2xl border transition-all duration-200 outline-none",
          isOpen ? "bg-indigo-50 border-indigo-200 shadow-sm" : "bg-slate-50 border-slate-100 hover:border-slate-300"
        )}
      >
        <div className="flex flex-col items-start leading-none">
          <span className="text-[14px] font-black text-slate-700">{format(date, 'HH:mm')}</span>
          <span className="text-[10px] font-bold text-slate-400">{format(date, 'dd/MM')}</span>
        </div>
        <div className={cn(
          "w-6 h-6 rounded-lg flex items-center justify-center transition-all",
          isOpen ? "bg-indigo-600 text-white" : "bg-white text-slate-300"
        )}>
          <Calendar className="w-3.5 h-3.5" />
        </div>
      </button>

      {isOpen && (
        <>
          {/* Mobile Backdrop and Modal */}
          <div className="fixed inset-0 z-[150] sm:hidden flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={(e) => e.stopPropagation()}>
            <div className="relative">
              <DateTimeWheelPicker date={date} onChange={handlePickerChange} />
              <button 
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute -top-12 right-0 w-8 h-8 bg-white rounded-full flex items-center justify-center text-slate-500 shadow-lg border border-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Desktop Dropdown */}
          <div className={cn(
            "hidden sm:block absolute top-[calc(100%+8px)] z-[100] min-w-max shadow-2xl",
            align === 'left' ? "left-0" : "right-0"
          )}>
            <DateTimeWheelPicker date={date} onChange={handlePickerChange} />
          </div>
        </>
      )}
    </div>
  );
}

import { X } from 'lucide-react';
