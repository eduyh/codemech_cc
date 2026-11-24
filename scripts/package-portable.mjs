import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const indexPath = path.join(distDir, 'index.html');
const battlefieldPath = path.join(distDir, 'battlefield.html');
const readmePath = path.join(distDir, 'README.txt');
const distMechsDir = path.join(distDir, 'mechs_sample');
const workspaceMechsDir = path.join(rootDir, 'mechs_sample');
const zipPath = path.join(rootDir, 'codemech-portable.zip');

if (!fs.existsSync(indexPath)) {
  throw new Error(`dist/index.html not found at ${indexPath}. Run npm run build first.`);
}

let html = fs.readFileSync(indexPath, 'utf8');
const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

const cssFile = assetFiles.find((f) => f.endsWith('.css'));
const jsFile = assetFiles.find((f) => f.endsWith('.js'));

if (!jsFile) {
  throw new Error('Built JS asset not found in dist/assets');
}

if (cssFile) {
  const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
  const safeCss = cssContent.replace(/<\/style/gi, '<\\/style');
  const cssLinkRegex = new RegExp(
    `<link[^>]+href=["']\\.?\\/?assets\\/${cssFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i'
  );
  if (cssLinkRegex.test(html)) {
    html = html.replace(cssLinkRegex, () => `<style>${safeCss}</style>`);
  } else {
    html = html.replace('</head>', () => `<style>${safeCss}</style>\n</head>`);
  }
}

const jsContent = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
const safeJs = jsContent.replace(/<\/script/gi, '<\\/script');
const jsScriptRegex = new RegExp(
  `<script[^>]+src=["']\\.?\\/?assets\\/${jsFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*<\\/script>`,
  'i'
);

if (jsScriptRegex.test(html)) {
  // Move inline script to end of body so #root exists regardless of module/classic timing
  html = html.replace(jsScriptRegex, () => '');
  html = html.replace(
    '</body>',
    () => `<script type="module">${safeJs}</script>\n</body>`
  );
} else {
  throw new Error(`Could not locate script tag for ${jsFile} in dist/index.html`);
}

fs.writeFileSync(indexPath, html, 'utf8');

let battlefieldHtml = html.replace(/<html([^>]*)>/i, (_full, attrs) =>
  /data-app-mode/i.test(attrs) ? `<html${attrs}>` : `<html${attrs} data-app-mode="battlefield">`
);
battlefieldHtml = battlefieldHtml
  .replace(
    /<title>[^<]*<\/title>/i,
    '<title>CodeMech.py - BATTLEFIELD | 大会・観戦アリーナ</title>'
  )
  .replace(/%2306b6d4/gi, '%23f59e0b')
  .replace(/%233b82f6/gi, '%23ef4444');
fs.writeFileSync(battlefieldPath, battlefieldHtml, 'utf8');

const readmeContent = `==================================================
  CodeMech.py - Code Your Pilot, Assemble Your Mech. (配布用)
==================================================

■ 動作環境
  ・Windows / Mac 両対応
  ・Google Chrome / Microsoft Edge / Safari / Firefox などの Webブラウザ
  ※ Python や Node.js、追加ソフトのインストールは不要です。
  ※ インターネット接続がなくてもオフラインで動作します。

■ 起動方法
  1. この ZIP ファイルをフォルダに解凍（展開）してください。
  2. 用途に応じて解凍したフォルダ内のファイルを開いてください：
     ・index.html       … パイロット AI 設計・機体アセンブル・訓練画面
     ・battlefield.html … 複数機体読込・3チーム×3機対戦・大会観戦アリーナ画面
     （ダブルクリックすると自動的にブラウザが開きます）

■ フォルダ構成と機体・リプレイの整理
  ・mechs_sample/          … 付属サンプル機体（更新時は最新版で上書きされます）
  ・mechs_user/            … ご自身で作成した機体・パイロット（.cmmech.json / .cmpilot.json / .py）の保管用
  ・mechs_import/          … 他人から受け取った機体データの保管用
  ・mechs_import/replays/  … 試合リプレイファイル（.cmreplay.json）の保管用

■ 学内閉域ネットワーク共有コード（外部サーバー不要）
  ・CMM1-   : 通常シェアコード（機体＋機体OS＋パイロットAI / 中身閲覧可）
  ・CMM1B-  : 対戦専用コード（読み取りガード・難読化付き / 大会対戦のみ許可）
  ・CMP1-   : パイロット単体コード（AI思考だけを切り出して別機体へ乗り換え）
  ・CMR1-   : 大会ルール・環境設定の配布コード
  ・CMC1-   : 挑戦状コード（1〜3機小隊＋ルール）
  ・CMW1-   : 試合リプレイ完全再現コード（長文時は .cmreplay.json 保存）
`;

fs.writeFileSync(readmePath, '\uFEFF' + readmeContent, 'utf8');

const SAMPLE_MECHS_README = `【mechs_sample/ - 付属サンプル機体フォルダ】

CodeMech.py に付属するサンプル機体データ（.cmmech.json）が格納されます。
※ アップデート展開時に最新版で上書きされるため、自作機体は ../mechs_user/ へ保管してください。
`;

async function exportMechSampleFiles() {
  const esbuildBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'
  );
  const samplesSrc = path.join(rootDir, 'src', 'data', 'sampleMechs.ts');
  const tmpBundle = path.join(os.tmpdir(), `codemech-samples-${process.pid}-${Date.now()}.mjs`);

  try {
    execFileSync(esbuildBin, [
      samplesSrc,
      '--bundle',
      '--format=esm',
      '--platform=node',
      `--outfile=${tmpBundle}`,
    ]);
    const mod = await import(pathToFileURL(tmpBundle).href);
    const list = (mod.SAMPLE_MECHS ?? []).filter(Boolean);

    for (const dir of [distMechsDir, workspaceMechsDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'README.txt'), '\uFEFF' + SAMPLE_MECHS_README, 'utf8');
      list.forEach((entry, idx) => {
        const num = entry.fileNumber ?? idx;
        const prefix = String(num).padStart(2, '0');
        const safeName =
          String(entry.name || entry.id || 'mech')
            .replace(/[^\w\u3040-\u30ff\u4e00-\u9faf\uff10-\uff19-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || 'mech';
        const fileName = `${prefix}_${safeName}.cmmech.json`;
        fs.writeFileSync(
          path.join(dir, fileName),
          JSON.stringify(entry.data ?? entry, null, 2),
          'utf8'
        );
      });
    }
    return list.length;
  } finally {
    if (fs.existsSync(tmpBundle)) {
      fs.unlinkSync(tmpBundle);
    }
  }
}

const FOLDER_READMES = [
  {
    segments: ['mechs_user'],
    content: `【mechs_user/ - 自作機体・パイロットの保管フォルダ】

ご自身で作成・書き出した機体やパイロットデータ（.cmmech.json / .cmpilot.json / .py）を整理・保管するためのフォルダです。
`,
  },
  {
    segments: ['mechs_import'],
    content: `【mechs_import/ - 外部・受領機体の保管フォルダ】

クラスメイトや教員など、他者から受け取った機体・パイロットデータを保管するためのフォルダです。
・リプレイファイル（.cmreplay.json）はサブフォルダ「replays/」へ整理してください。
`,
  },
  {
    segments: ['mechs_import', 'replays'],
    content: `【mechs_import/replays/ - 試合リプレイの保管フォルダ】

受け取ったリプレイファイルや保存したリプレイファイル（.cmreplay.json）を整理・保管するためのフォルダです。
`,
  },
];

function prepareUserAndImportFolders() {
  for (const top of ['mechs_user', 'mechs_import']) {
    fs.rmSync(path.join(distDir, top), { recursive: true, force: true });
  }
  for (const item of FOLDER_READMES) {
    const distTargetDir = path.join(distDir, ...item.segments);
    fs.mkdirSync(distTargetDir, { recursive: true });
    fs.writeFileSync(path.join(distTargetDir, 'README.txt'), '\uFEFF' + item.content, 'utf8');

    const wsTargetDir = path.join(rootDir, ...item.segments);
    fs.mkdirSync(wsTargetDir, { recursive: true });
    fs.writeFileSync(path.join(wsTargetDir, 'README.txt'), '\uFEFF' + item.content, 'utf8');
  }
}

const exportedMechCount = await exportMechSampleFiles();
prepareUserAndImportFolders();

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

execFileSync(
  'zip',
  ['-r', zipPath, 'index.html', 'battlefield.html', 'README.txt', 'mechs_sample', 'mechs_user', 'mechs_import'],
  {
    cwd: distDir,
    stdio: 'inherit',
  }
);

const htmlSizeKb = (fs.statSync(indexPath).size / 1024).toFixed(1);
const bfSizeKb = (fs.statSync(battlefieldPath).size / 1024).toFixed(1);
const zipSizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`Portable index.html: ${htmlSizeKb} KB`);
console.log(`Portable battlefield.html: ${bfSizeKb} KB`);
console.log(`Exported ${exportedMechCount} mech files to mechs_sample/ and dist/mechs_sample/`);
console.log(`Created archive: ${zipPath} (${zipSizeKb} KB)`);
