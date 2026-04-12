import type { NavigatorScreenParams } from '@react-navigation/native';

export type Category = {
  id: string;
  name: string;
  icon: 'car-sport-outline' | 'bus-outline' | 'medkit-outline' | 'airplane-outline';
};

export type Service = {
  id: string;
  name: string;
  categoryId: string;
};

export type Provider = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  priceEstimate: string;
  specialty: string;
  /** Raw `providers.location` when loaded from API (may include distance text). */
  location?: string;
  /** From `providers.base_price_cents` when loaded from API. */
  basePriceCents?: number;
  aiRecommended?: boolean;
  aiReason?: string;
};

export type ChatMessage = {
  id: string;
  text: string;
  sentAt: string;
  isMine: boolean;
};

export type Booking = {
  id: string;
  serviceName: string;
  providerName: string;
  dateLabel: string;
  timeLabel: string;
  status: 'confirmed' | 'pending' | 'completed';
  paymentStatus?: string;
};

export type Car = {
  id: string;
  make: string;
  model: string;
  year: string;
  plate: string;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Bookings: undefined;
  MyCars: undefined;
  ProviderServicesTab: undefined;
  Profile: undefined;
};

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  SelectService: { preselectServiceId?: string; categoryId?: string; query?: string } | undefined;
  RequestDetails: { serviceId: string; serviceName: string };
  ProviderList: { serviceName: string; description?: string; requestId?: string };
  BookingConfirm: {
    providerId: string;
    providerName: string;
    serviceName?: string;
    /** When set, loads this listing (reviews, gallery, price). Otherwise resolved from provider + serviceName. */
    providerServiceId?: string;
    requestId?: string;
    bookingId?: string;
    date?: string;
    time?: string;
    paymentMethod?: 'card' | 'mobile_money' | 'pay_later' | 'wallet';
  };
  AiAssistant: { seed?: string } | undefined;
  DamageScan: undefined;
  Notifications: undefined;
  MyCars: undefined;
  AddCar: { carId?: string } | undefined;
  CarScan: { carId: string; mode: 'cluster' | 'interior' | 'exterior' };
  ProviderDashboard: undefined;
  ProviderCategories: undefined;
  ProviderServices: undefined;
  ProviderServiceEdit: { serviceId?: string } | undefined;
  ProviderBookings: undefined;
  Wallet: undefined;
  WalletTransactions: undefined;
  WalletPayees: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  App: NavigatorScreenParams<AppStackParamList> | undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
