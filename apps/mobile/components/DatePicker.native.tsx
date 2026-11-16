import React from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';

interface DatePickerProps {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  onChange: (_event: unknown, _date?: Date) => void;
}

export default function DatePicker({ value, mode = 'date', onChange }: DatePickerProps) {
  const nativeProps: React.ComponentProps<typeof DateTimePicker> = {
    value,
    mode,
    onChange,
  };

  return <DateTimePicker {...nativeProps} />;
}
