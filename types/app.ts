import type { RefObject } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

export interface TransactionBottomSheetProps {
  bottomSheetRef: RefObject<BottomSheetModal | null>;
  initialType: 'gasto' | 'ingreso';
}
