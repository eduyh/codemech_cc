import { useEffect, useState } from 'react';
import { Check, Copy, Download, Share2, Upload, User, X } from 'lucide-react';
import {
  DEFAULT_USER_NAME,
  UserProfile,
  buildDefaultTeamName,
  exportFullBackupJson,
  getShortUserId,
  normalizeUserName,
  parseBackupJson,
  restoreFullBackup,
} from '../utils/userProfile';

interface StudioMenuDrawerProps {
  open: boolean;
  onClose: () => void;
  appVersion: string;
  userProfile: UserProfile;
  onSaveUserName: (name: string) => UserProfile;
  counts: {
    mechs: number;
    pilots: number;
    roms: number;
    teams: number;
  };
  onBackupRestored: () => void;
  onOpenShareModal?: () => void;
}

function downloadJsonFile(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StudioMenuDrawer({
  open,
  onClose,
  appVersion,
  userProfile,
  onSaveUserName,
  counts,
  onBackupRestored,
  onOpenShareModal,
}: StudioMenuDrawerProps) {
  const [nameDraft, setNameDraft] = useState(userProfile.userName);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [copiedUuid, setCopiedUuid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNameDraft(userProfile.userName);
      setNotice(null);
      setErrorMsg(null);
      setCopiedUuid(false);
    }
  }, [open, userProfile.userName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cleanPreview = normalizeUserName(nameDraft) || DEFAULT_USER_NAME;
  const defaultTeamPreview = buildDefaultTeamName(cleanPreview, [], userProfile.userId);
  const shortUuid = getShortUserId(userProfile.userId);

  const handleSaveName = () => {
    setErrorMsg(null);
    const saved = onSaveUserName(nameDraft);
    setNameDraft(saved.userName);
    const nextTeam = buildDefaultTeamName(saved.userName, [], saved.userId);
    setNotice(
      `ユーザー名を「${saved.userName}」に設定しました（既定小隊名: ${nextTeam}）。`
    );
  };

  const handleCopyUuid = async () => {
    setErrorMsg(null);
    try {
      await navigator.clipboard.writeText(userProfile.userId);
      setCopiedUuid(true);
      setTimeout(() => setCopiedUuid(false), 1500);
    } catch {
      setErrorMsg('UUID のコピーに失敗しました。');
    }
  };

  const handleExportBackup = () => {
    setErrorMsg(null);
    try {
      const json = exportFullBackupJson(appVersion);
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const tag = userProfile.userName || DEFAULT_USER_NAME;
      downloadJsonFile(`codemech-backup-${tag}-${shortUuid}-${stamp}.cmbackup.json`, json);
      setNotice('全ローカルデータ（機体・パイロット・ROM・チーム・設定）をバックアップ保存しました。');
    } catch {
      setErrorMsg('バックアップファイルの生成に失敗しました。');
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    setNotice(null);
    try {
      const text = await file.text();
      const payload = parseBackupJson(text);
      const summary = restoreFullBackup(payload, restoreMode);
      onBackupRestored();
      setNotice(
        `${restoreMode === 'merge' ? 'マージ' : '上書き'}復元完了: 機体 ${summary.mechs} / パイロット ${summary.pilots} / ROM ${summary.roms} / チーム ${summary.teams}`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'バックアップ復元に失敗しました。');
    }
  };

  return (
    <div
      className="cm-drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="ユーザー設定とバックアップメニュー"
      onClick={onClose}
    >
      <aside className="cm-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cm-drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <User size={18} />
            <strong>ユーザー設定 ＆ バックアップ</strong>
          </div>
          <button type="button" className="cm-icon-btn" onClick={onClose} aria-label="メニューを閉じる">
            <X size={16} />
          </button>
        </div>

        <section className="cm-drawer-section">
          <div className="cm-subhead">ユーザー名（コールサイン）＆ UUID</div>
          <p className="cm-drawer-help">
            既定名は <code>{DEFAULT_USER_NAME}</code> です。空欄で保存すると <code>{DEFAULT_USER_NAME}</code> に戻ります。提出コードや機体には固有の UUID も付与されるため、同じユーザー名同士でもマッチング時に自動識別されます。
          </p>
          <div className="cm-drawer-input-row">
            <input
              type="text"
              aria-label="ユーザー名"
              maxLength={16}
              placeholder="例: Commander / ACE-01 / Valkyrie"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
              }}
            />
            <button type="button" className="cm-btn-primary-xs" onClick={handleSaveName}>
              <Check size={13} /> 保存
            </button>
          </div>
          <div className="cm-drawer-uuid-row">
            <span className="cm-drawer-uuid-label">UUID (#{shortUuid})</span>
            <code className="cm-drawer-uuid-val">{userProfile.userId}</code>
            <button
              type="button"
              className="cm-btn-xs"
              onClick={handleCopyUuid}
              title="UUID をコピー"
            >
              {copiedUuid ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
          <div className="cm-drawer-preview">
            既定小隊名プレビュー: <strong>{defaultTeamPreview}</strong>
          </div>
        </section>

        <section className="cm-drawer-section">
          <div className="cm-subhead">ローカル保存データ</div>
          <div className="cm-drawer-stats">
            <div>
              <span>自作機体</span>
              <strong>{counts.mechs}</strong>
            </div>
            <div>
              <span>パイロット</span>
              <strong>{counts.pilots}</strong>
            </div>
            <div>
              <span>機体ROM</span>
              <strong>{counts.roms}</strong>
            </div>
            <div>
              <span>保存チーム</span>
              <strong>{counts.teams}</strong>
            </div>
          </div>
        </section>

        <section className="cm-drawer-section">
          <div className="cm-subhead">全データ バックアップ ＆ 復元 (.cmbackup.json)</div>
          <p className="cm-drawer-help">
            ブラウザのキャッシュ消去や別PCへの移行に備え、ユーザー情報・自作機体・AI・ROM・チーム一式を JSON ファイルで保存・復元できます。
          </p>
          <button
            type="button"
            className="cm-btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleExportBackup}
          >
            <Download size={15} /> 全データバックアップ保存
          </button>

          <div className="cm-drawer-restore-box">
            <label className="cm-select-row">
              <span>復元方式</span>
              <select
                aria-label="バックアップ復元方式"
                value={restoreMode}
                onChange={(e) => setRestoreMode(e.target.value as 'merge' | 'overwrite')}
              >
                <option value="merge">マージ復元 (既存データを残す)</option>
                <option value="overwrite">完全上書き復元 (置き換える)</option>
              </select>
            </label>

            <label
              className="cm-btn-secondary"
              style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Upload size={15} /> バックアップ読込 (.json)
              <input
                type="file"
                accept=".json,.cmbackup.json"
                style={{ display: 'none' }}
                onChange={handleRestoreFile}
              />
            </label>
          </div>
        </section>

        {onOpenShareModal && (
          <section className="cm-drawer-section">
            <button
              type="button"
              className="cm-btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => {
                onClose();
                onOpenShareModal();
              }}
            >
              <Share2 size={15} /> 機体・パイロット共有画面を開く
            </button>
          </section>
        )}

        {errorMsg && <div className="cm-error-box">{errorMsg}</div>}
        {notice && <div className="cm-ok-box">{notice}</div>}
      </aside>
    </div>
  );
}
