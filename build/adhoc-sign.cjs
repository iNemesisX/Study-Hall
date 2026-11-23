// electron-builder afterPack hook. Apple Silicon Macs refuse to run apps with no
// signature at all, so without a paid Apple Developer ID the Mac app gets an
// "ad-hoc" signature. macOS then asks people to approve it once in
// System Settings → Privacy & Security ("Open Anyway").
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // A universal app is built from an Intel and an Apple-silicon copy that must still be
  // identical apart from their code, so only the merged app (arch 4 = universal) is signed.
  const targets = context.packager.platformSpecificBuildOptions?.target || [];
  const universal = JSON.stringify(targets).includes('universal');
  if (universal && context.arch !== 4) return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
