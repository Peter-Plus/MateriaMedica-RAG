module.exports = {
  outDir: `out/${require('./package.json').version}`,
  packagerConfig: {
    name: '本草问答',
    executableName: 'BCRAG',
    // Optional local cache for builds when the Electron download is unavailable.
    ...(process.env.BCRAG_ELECTRON_ZIP_DIR ? { electronZipDir: process.env.BCRAG_ELECTRON_ZIP_DIR } : {}),
    asar: true
  },
  makers: [{ name: '@electron-forge/maker-zip', platforms: ['win32'] }]
};
