import { Timestamp } from 'firebase/firestore';

export interface Homestay {
  id: string;
  name: string;
  roomCount: number;
}

export interface Room {
  id: string;
  homestayId: string;
  name: string;
}

export type BookingStatus = 'Confirmed' | 'Pending' | 'Cancelled' | 'Staying';
export type PaymentStatus = 'Deposit' | 'Paid';

export interface Booking {
  id?: string;
  homestayId: string;
  roomId: string;
  checkIn: Timestamp;
  checkOut: Timestamp;
  price: number;
  depositAmount?: number;
  paymentStatus?: PaymentStatus;
  userId: string;
  guestName?: string;
  status?: BookingStatus;
  staffName?: string;
  staffColor?: string;
  isEdited?: boolean;
  history?: Array<Partial<Booking> & { updatedAt: Timestamp }>;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string; }[];
  }
}

export interface AuthProfile {
  email: string;
  username?: string;
  role: 'admin' | 'staff';
  status?: 'active' | 'pending';
  addedAt: any;
}
