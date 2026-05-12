export interface UserProfile {
  uid: string;
  email: string;
  role: 'vendor' | 'customer';
  name?: string;
}

export interface AppConfig {
  currency: string;
  locale: string;
}

export interface ProductData {
  price: number;
  unit: string;
  weightPerUnit: number;
}
