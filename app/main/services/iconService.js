const path = require('node:path');
const fs = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function extractExecutableIcon({ app, executablePath }) {
  if (!executablePath) {
    return '';
  }

  const iconDirectory = path.join(app.getPath('userData'), 'icons');
  const outputFile = path.join(iconDirectory, `${path.basename(executablePath, path.extname(executablePath))}.png`);
  const escapedExecutablePath = executablePath.replace(/'/g, "''");
  const escapedOutputFile = outputFile.replace(/'/g, "''");
  const command = [
    'Add-Type -AssemblyName System.Drawing;',
    `$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${escapedExecutablePath}');`,
    "if ($icon -ne $null) {",
    '  $bmp = $icon.ToBitmap();',
    `  $bmp.Save('${escapedOutputFile}');`,
    '  $bmp.Dispose();',
    '}'
  ].join(' ');

  try {
    await fs.mkdir(iconDirectory, { recursive: true });
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true
    });
    return outputFile;
  } catch (error) {
    return '';
  }
}

async function buildAllowedApp({ app, windowInfo }) {
  if (!windowInfo) {
    throw new Error('No active application was detected.');
  }

  const executablePath = windowInfo.path || '';

  return {
    name: windowInfo.name || windowInfo.exe || 'Unknown App',
    exe: windowInfo.exe || (executablePath ? path.basename(executablePath) : ''),
    path: executablePath,
    icon: executablePath ? await extractExecutableIcon({ app, executablePath }) : ''
  };
}

module.exports = {
  buildAllowedApp,
  extractExecutableIcon
};
