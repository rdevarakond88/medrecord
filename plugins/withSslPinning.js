/**
 * Expo config plugin — bundles TLS cert files for react-native-ssl-pinning.
 *
 * WHY: react-native-ssl-pinning requires cert files in native directories:
 *   iOS:     ios/<AppName>/ (added as a resource in the Xcode project)
 *   Android: android/app/src/main/assets/
 * In Expo managed workflow these directories don't exist in the repo —
 * this plugin copies the cert during `eas build` prebuild phase.
 *
 * Cert: Google Trust Services WE1 (intermediate CA for medrecord-api.onrender.com)
 * Valid until: Feb 20, 2029. Rotate when Render changes its CA chain.
 */

const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const CERT_SRC = path.join(__dirname, '..', 'assets', 'certs', 'api_medrecord_intermediate.cer');
const CERT_NAME = 'api_medrecord_intermediate.cer';

const withSslPinningAndroid = (config) =>
  withDangerousMod(config, [
    'android',
    async (config) => {
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
      );
      if (!fs.existsSync(assetsDir)) {
        fs.mkdirSync(assetsDir, { recursive: true });
      }
      fs.copyFileSync(CERT_SRC, path.join(assetsDir, CERT_NAME));
      return config;
    },
  ]);

const withSslPinningIos = (config) =>
  withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const appName = config.modRequest.projectName;
      const targetDir = path.join(projectRoot, appName);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(CERT_SRC, path.join(targetDir, CERT_NAME));
      return config;
    },
  ]);

/**
 * Combined plugin — apply both platforms.
 */
const withSslPinning = (config) => {
  config = withSslPinningAndroid(config);
  config = withSslPinningIos(config);
  return config;
};

module.exports = withSslPinning;
