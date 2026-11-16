import { AppRegistry } from 'react-native';
import App from './apps/mobile/App';
import { name } from './apps/mobile/app.json';

const font = new FontFace('MaterialDesignIcons', `url(${new URL('@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf', import.meta.url)})`);
document.fonts.add(font);
void font.load().catch(() => console.error('No se pudo cargar la fuente de iconos.'));

AppRegistry.registerComponent(name, () => App);
AppRegistry.runApplication(name, { rootTag: document.getElementById('root') });
