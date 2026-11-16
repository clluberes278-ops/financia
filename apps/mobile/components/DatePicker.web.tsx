import React from 'react';
import { View } from 'react-native';

interface DatePickerWebProps {
  value: Date;
  mode?: 'date' | 'time' | 'datetime';
  onChange: (_event: unknown, _date?: Date) => void;
}

export default function DatePickerWeb({ value, mode = 'date', onChange }: DatePickerWebProps) {
  const inputValue = value.toISOString().slice(0, 10);
  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 42,
    borderRadius: 10,
    border: '1px solid #CBD5E1',
    padding: '10px 12px',
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
  };

  return (
    <View style={{ width: '100%' }}>
      <input
        type={mode === 'time' ? 'time' : 'date'}
        value={inputValue}
        onChange={(event) => {
          const nextValue = event.currentTarget.value ? new Date(`${event.currentTarget.value}T00:00:00`) : undefined;
          onChange(event, nextValue);
        }}
        style={inputStyle}
      />
    </View>
  );
}
