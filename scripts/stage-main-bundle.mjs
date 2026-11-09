import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyPackage } from '../installer.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(project, 'dist');
const bundle = path.join(output, 'package', 'YoBot');
const git = (args, input) => execFileSync('git', args, { cwd: project, input, encoding: 'utf8' });
const manifest = verifyPackage(bundle);
const pkg = JSON.parse(git(['show', 'HEAD:package.json']));
if (manifest.version !== pkg.version) throw Error('Build the current commit before staging the bundle.');

const generated = new Set(['config.js', 'release.json', ...manifest.files
    .map(file => file.path)
    .filter(file => /^(node_modules|runtime)\//.test(file))]);
const files = [...generated];
const paths = files.map(file => path.join(bundle, file).replaceAll('\\', '/'));
const hashes = git(['hash-object', '--no-filters', '-w', '--stdin-paths'], paths.join('\n') + '\n').trim().split(/\r?\n/);
if (hashes.length !== files.length) throw Error('Git did not hash every bundle file.');

const tracked = git(['ls-files', '-z', '--', 'node_modules', 'runtime']).split('\0').filter(Boolean);
const removed = tracked.filter(file => !generated.has(file));
const index = removed.map(file => '0 ' + '0'.repeat(40) + '\t' + file + '\0');
for (const [i, file] of files.entries()) index.push('100644 ' + hashes[i] + '\t' + file + '\0');
git(['update-index', '-z', '--index-info'], index.join(''));

// Check the actual archive generated from the Git index, including export-ignore and line endings.
const temporary = fs.mkdtempSync(path.join(output, 'main-archive-'));
try {
    const zip = path.join(temporary, 'main.zip');
    const extracted = path.join(temporary, 'extracted');
    const tree = git(['write-tree']).trim();
    git(['-c', 'core.autocrlf=false', 'archive', '--format=zip', '--output=' + zip, tree]);
    const powershell = path.join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
    execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
        "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory($env:YOBOT_ARCHIVE,$env:YOBOT_EXTRACT)"],
        { windowsHide: true, env: { ...process.env, YOBOT_ARCHIVE: zip, YOBOT_EXTRACT: extracted } });
    if (!fs.readFileSync(path.join(extracted, 'release.json')).equals(fs.readFileSync(path.join(bundle, 'release.json')))) {
        throw Error('Git archive has a different release manifest.');
    }
    verifyPackage(extracted);
    console.log('Git archive matches every file in release ' + manifest.version);
} finally {
    if (path.dirname(temporary) !== output || !path.basename(temporary).startsWith('main-archive-')) throw Error('Unsafe cleanup path');
    fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5 });
}
