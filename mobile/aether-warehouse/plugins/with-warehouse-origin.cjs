const { withAndroidManifest, withInfoPlist } = require('expo/config-plugins');
module.exports = function withWarehouseOrigin(config) {
  const origin = config.extra?.platformUrl || '';
  config = withAndroidManifest(config, (result) => {
    const application = result.modResults.manifest.application[0];
    application['meta-data'] = (application['meta-data'] || []).filter((item) => item.$['android:name'] !== 'cl.aether.bodega.PLATFORM_URL');
    application['meta-data'].push({ $: { 'android:name': 'cl.aether.bodega.PLATFORM_URL', 'android:value': origin } });
    return result;
  });
  return withInfoPlist(config, (result) => { result.modResults.AetherPlatformURL = origin; return result; });
};
