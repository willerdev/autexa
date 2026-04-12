import type { Category, Service, Provider, ChatMessage, Booking, Car } from '../types';

export const categories: Category[] = [
  { id: 'auto', name: 'Auto', icon: 'car-sport-outline' as const },
  { id: 'transport', name: 'Transport', icon: 'bus-outline' as const },
  { id: 'health', name: 'Health', icon: 'medkit-outline' as const },
  { id: 'travel', name: 'Travel', icon: 'airplane-outline' as const },
];

export const quickServices: Service[] = [
  { id: 'wash', name: 'Car Wash', categoryId: 'auto' },
  { id: 'mechanic', name: 'Mechanic', categoryId: 'auto' },
  { id: 'tow', name: 'Tow Truck', categoryId: 'auto' },
];

export const servicesForSelect: Service[] = [
  ...quickServices,
  { id: 'detail', name: 'Detailing', categoryId: 'auto' },
  { id: 'tire', name: 'Tire Service', categoryId: 'auto' },
  { id: 'battery', name: 'Battery Jump', categoryId: 'auto' },
  { id: 'inspection', name: 'Inspection', categoryId: 'auto' },
];

export const featuredProviders: Provider[] = [
  {
    id: 'p1',
    name: 'Sparkle Auto Wash',
    rating: 4.9,
    reviewCount: 214,
    distanceKm: 1.2,
    priceEstimate: 'from $25',
    specialty: 'Car Wash',
  },
  {
    id: 'p2',
    name: 'Torque Masters Garage',
    rating: 4.8,
    reviewCount: 189,
    distanceKm: 2.4,
    priceEstimate: 'from $89',
    specialty: 'Mechanic',
  },
  {
    id: 'p3',
    name: 'RoadRescue Towing',
    rating: 4.7,
    reviewCount: 312,
    distanceKm: 3.1,
    priceEstimate: 'from $75',
    specialty: 'Tow Truck',
  },
];

export const providersList: Provider[] = [
  ...featuredProviders,
  {
    id: 'p4',
    name: 'Elite Detailing Co.',
    rating: 4.9,
    reviewCount: 98,
    distanceKm: 4.5,
    priceEstimate: 'from $120',
    specialty: 'Detailing',
  },
  {
    id: 'p5',
    name: 'QuickFix Mobile',
    rating: 4.6,
    reviewCount: 156,
    distanceKm: 5.2,
    priceEstimate: 'from $65',
    specialty: 'On-site repair',
  },
];

export const mockChatMessages: ChatMessage[] = [
  {
    id: 'm1',
    text: 'Hi! Your mechanic is 8 minutes away.',
    sentAt: new Date(Date.now() - 3600000).toISOString(),
    isMine: false,
  },
  {
    id: 'm2',
    text: 'Great, I will be by the parking entrance.',
    sentAt: new Date(Date.now() - 3500000).toISOString(),
    isMine: true,
  },
  {
    id: 'm3',
    text: 'Perfect. License plate ending 42?',
    sentAt: new Date(Date.now() - 3480000).toISOString(),
    isMine: false,
  },
  {
    id: 'm4',
    text: 'Yes, that is correct.',
    sentAt: new Date(Date.now() - 3400000).toISOString(),
    isMine: true,
  },
];

export const mockBookings: Booking[] = [
  {
    id: 'b1',
    serviceName: 'Oil change',
    providerName: 'Torque Masters Garage',
    dateLabel: 'Sat, Apr 12',
    timeLabel: '10:30 AM',
    status: 'confirmed',
  },
  {
    id: 'b2',
    serviceName: 'Interior detail',
    providerName: 'Elite Detailing Co.',
    dateLabel: 'Mon, Apr 14',
    timeLabel: '2:00 PM',
    status: 'pending',
  },
];

export const defaultCars: Car[] = [
  { id: 'c1', make: 'Toyota', model: 'Camry', year: '2020', plate: 'ABC-4242' },
];
