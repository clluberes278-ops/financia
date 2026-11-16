import React, { type PropsWithChildren } from 'react';

// Web uses TransactionModal; do not initialize the native animation stack here.
export function BottomSheetModalProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}
