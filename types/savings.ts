export interface SavingsPocket {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number; // Meta fija que el usuario desea alcanzar
  currentAmount: number; // Monto acumulado actualmente en este bolsillo
  createdAt: string;
  color?: string;
}
