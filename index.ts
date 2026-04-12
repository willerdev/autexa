import './src/polyfills/installCrypto';
import 'react-native-url-polyfill/auto';
import 'react-native-gesture-handler';
import { LogBox } from 'react-native';
import { registerRootComponent } from 'expo';

// Expected fetch failures still surface via Alert; LogBox duplicates them and draws over the gesture bar on Android.
if (__DEV__) {
  LogBox.ignoreLogs([/Network request failed/i]);
}

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
