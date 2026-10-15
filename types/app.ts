export interface BiometricLockOverlayProps {
  onAuthenticated: () => void;
}

export interface TransactionBottomSheetProps {
  bottomSheetRef: any; // To be refined further once @gorhom/bottom-sheet types are fully resolved
  initialType: 'gasto' | 'ingreso';
}

export interface TransactionModalProps {
  visible: boolean;
  onClose: () => void;
  type: 'gasto' | 'ingreso';
  onSave: (transaction: any) => void;
}
