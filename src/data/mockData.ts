import type { Category, Service, Provider, ChatMessage, Booking, Car } from '../types';

export const categories: Category[] = [
  { id: 'body_works', name: 'Body works', icon: 'color-palette-outline' },
  { id: 'car_detailing', name: 'Car Detailing', icon: 'sparkles-outline' },
  { id: 'car_inspection', name: 'Car inspection and review', icon: 'search-outline' },
  { id: 'car_maintenance', name: 'Car maintenance', icon: 'build-outline' },
  { id: 'car_upgrades', name: 'Car Upgrades', icon: 'trending-up-outline' },
  { id: 'car_spare_parts', name: 'Car spare Parts', icon: 'cube-outline' },
  { id: 'delivery_services', name: 'Delivery Services', icon: 'bicycle-outline' },
  { id: 'mechanical_works', name: 'Mechanical works', icon: 'construct-outline' },
  { id: 'tow_trucks', name: 'Tow Trucks services', icon: 'car-outline' },
];

export const quickServices: Service[] = [
  { id: 'wash', name: 'Car Wash', categoryId: 'car_detailing' },
  { id: 'mechanic', name: 'Mechanic', categoryId: 'mechanical_works' },
  { id: 'tow', name: 'Tow Truck', categoryId: 'tow_trucks' },
];

export const servicesForSelect: Service[] = [
  ...quickServices,
  { id: 'detail', name: 'Detailing', categoryId: 'car_detailing' },
  { id: 'tire', name: 'Tire Service', categoryId: 'car_maintenance' },
  { id: 'battery', name: 'Battery Jump', categoryId: 'car_maintenance' },
  { id: 'inspection', name: 'Inspection', categoryId: 'car_inspection' },
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
