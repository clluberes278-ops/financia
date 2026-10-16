import { Platform } from 'react-native';
import DatePickerWeb from './DatePicker.web';
import DatePickerNative from './DatePicker.native';

export default Platform.OS === 'web' ? DatePickerWeb : DatePickerNative;
