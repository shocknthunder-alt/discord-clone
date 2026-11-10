// electron-builder's own icon/metadata step (winCodeSign) needs symlink privileges on Windows, so it
// is disabled (signAndEditExecutable:false) and the exe icon is set here with rcedit instead.
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;
  const { rcedit } = await import("rcedit");
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  await rcedit(exe, {
    icon: path.join(__dirname, "build", "icon.ico"),
    "version-string": { ProductName: "ШмиркаТа", FileDescription: "ШмиркаТа" },
  });
};
