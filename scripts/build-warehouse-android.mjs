import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const mobile = path.join(root, 'mobile/aether-warehouse');
const settings = JSON.parse(await readFile(path.join(root, '.codex-audit/warehouse/android-tools/environment.json'), 'utf8'));
const env = { ...process.env, JAVA_HOME: settings.javaHome, ANDROID_HOME: settings.sdkHome, ANDROID_SDK_ROOT: settings.sdkHome, PATH: `${path.join(settings.javaHome, 'bin')};${process.env.PATH}` };
const run = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: 'inherit' });
  child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`La compilación terminó con código ${code}`)));
});
if (!process.argv.includes('--skip-prebuild')) await run(process.execPath, [path.join(mobile, 'node_modules/expo/bin/cli'), 'prebuild', '--platform', 'android', '--no-install'], mobile);
await run(path.join(settings.javaHome, 'bin/java.exe'), ['-classpath', path.join(mobile, 'android/gradle/wrapper/gradle-wrapper.jar'), 'org.gradle.wrapper.GradleWrapperMain', 'assembleRelease', '-PreactNativeArchitectures=arm64-v8a', '--no-daemon', '--max-workers=2', '--console=plain'], path.join(mobile, 'android'));
const output = path.join(root, '.codex-audit/warehouse/artifacts');
await mkdir(output, { recursive: true });
await copyFile(path.join(mobile, 'android/app/build/outputs/apk/release/app-release.apk'), path.join(output, 'aether-bodega-piloto-arm64.apk'));
console.log('APK de piloto creado (firma de desarrollo; no es una publicación en tiendas).');
