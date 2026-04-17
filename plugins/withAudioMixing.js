const { withAppDelegate } = require('@expo/config-plugins');

// Configure AVAudioSession to mix with other apps' audio (e.g. Music app).
// Without this, iOS interrupts background music when the camera mic session starts.
// Category: playAndRecord (needed for video recording)
// Options: mixWithOthers + allowBluetooth (keeps background audio playing)
const AUDIO_SETUP = `    do {
      try AVAudioSession.sharedInstance().setCategory(
        .playAndRecord,
        mode: .default,
        options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker]
      )
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {}`;

module.exports = function withAudioMixing(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') return config;

    let contents = config.modResults.contents;

    if (!contents.includes('import AVFoundation')) {
      contents = contents.replace('import UIKit', 'import UIKit\nimport AVFoundation');
    }

    // Insert audio session setup before the super call in didFinishLaunchingWithOptions
    contents = contents.replace(
      /(\s*return super\.application\(application, didFinishLaunchingWithOptions: launchOptions\))/,
      `\n${AUDIO_SETUP}\n$1`,
    );

    config.modResults.contents = contents;
    return config;
  });
};
