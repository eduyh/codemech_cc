import { useEffect, useState } from 'react';
import { Check, Copy, Download, Lock, Share2, ShieldCheck, Unlock, Upload, User, X } from 'lucide-react';
import { CURRICULUM_MISSIONS } from '../data/curriculum';
import { ClearCodePayload, decodeClearCode } from '../utils/clearCode';
import { verifyTeacherUnlockCode } from '../utils/curriculumProgress';
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
  teacherMode?: boolean;
  onChangeTeacherMode?: (enabled: boolean) => void;
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
  teacherMode = false,
  onChangeTeacherMode,
}: StudioMenuDrawerProps) {
  const [nameDraft, setNameDraft] = useState(userProfile.userName);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge');
  const [copiedUuid, setCopiedUuid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [clearVerifyInput, setClearVerifyInput] = useState('');
  const [decodedClear, setDecodedClear] = useState<ClearCodePayload | null>(null);
  const [clearVerifyErr, setClearVerifyErr] = useState<string | null>(null);
  const [teacherKeyInput, setTeacherKeyInput] = useState('');
  const [teacherKeyErr, setTeacherKeyErr] = useState<string | null>(null);

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

        <section className="cm-drawer-section">
          <div className="cm-subhead">クリアコード復号テスト (CMK1-)</div>
          <p className="cm-drawer-help">
            提出された <code>CMK1-</code> クリアコードを貼り付けて、改ざんチェックと達成進捗を確認できます。
          </p>
          <div className="cm-drawer-input-row">
            <input
              type="text"
              aria-label="クリアコード復号入力"
              placeholder="CMK1-... を貼り付け"
              value={clearVerifyInput}
              onChange={(e) => setClearVerifyInput(e.target.value)}
            />
            <button
              type="button"
              className="cm-btn-xs"
              onClick={() => {
                setClearVerifyErr(null);
                setDecodedClear(null);
                try {
                  setDecodedClear(decodeClearCode(clearVerifyInput));
                } catch (err) {
                  setClearVerifyErr(
                    err instanceof Error ? err.message : 'クリアコードの復号に失敗しました。'
                  );
                }
              }}
            >
              <ShieldCheck size={13} /> 確認
            </button>
          </div>
          {clearVerifyErr && <div className="cm-error-box">{clearVerifyErr}</div>}
          {decodedClear && (() => {
            const total = decodedClear.totalStages ?? CURRICULUM_MISSIONS.length;
            const stageCodeMap = new Map(CURRICULUM_MISSIONS.map((m) => [m.id, m.stageCode]));
            const clearedLabels = decodedClear.clearedSteps.map((id) => stageCodeMap.get(id) ?? id);
            const totalFailedAttempts = Object.values(decodedClear.attemptCounts ?? {}).reduce(
              (acc, v) => acc + (v ?? 0),
              0
            );
            return (
              <div className="cm-ok-box cm-drawer-clearcode-res">
                <div>
                  提出者: <strong>{decodedClear.studentName}</strong>
                  {decodedClear.userId ? ` (#${getShortUserId(decodedClear.userId)})` : ''}
                </div>
                <div>
                  全体進捗: <strong>{decodedClear.clearedSteps.length} / {total}</strong>
                  {typeof decodedClear.part1Cleared === 'number' &&
                    typeof decodedClear.part2Cleared === 'number' &&
                    ` （第1部 ${decodedClear.part1Cleared}/12 ・ 第2部 ${decodedClear.part2Cleared}/12）`}
                </div>
                <div>
                  クリア済: {clearedLabels.length > 0 ? clearedLabels.join(', ') : 'なし'}
                </div>
                <div>
                  ヒント閲覧: {decodedClear.hintViewedSteps?.length ?? 0}問 / 模範解答解放:{' '}
                  {decodedClear.unlockedSolutionSteps?.length ?? 0}問 / 異なる誤試行計:{' '}
                  {totalFailedAttempts}回
                </div>
                {decodedClear.issuedAt && (
                  <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                    発行日時: {decodedClear.issuedAt}
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {onChangeTeacherMode && (
          <section className="cm-drawer-section">
            <div className="cm-subhead">教員モード（全模範解答ロック解除）</div>
            <p className="cm-drawer-help">
              教員用キーを入力すると、学習課題のすべてのステージで即座に模範解答を閲覧・読み込みできます（当日中のみ有効・教員モード中の実行はクリア実績やクリアコードに記録されません）。
            </p>
            {teacherMode ? (
              <div className="cm-ok-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span>教員モード有効中（クリア実績は記録されません）</span>
                <button
                  type="button"
                  className="cm-btn-xs"
                  onClick={() => {
                    onChangeTeacherMode(false);
                    setTeacherKeyInput('');
                    setTeacherKeyErr(null);
                  }}
                >
                  <Lock size={12} /> ロックに戻す
                </button>
              </div>
            ) : (
              <>
                <div className="cm-drawer-input-row">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    aria-label="教員ロック解除キー"
                    placeholder="4桁キー"
                    value={teacherKeyInput}
                    onChange={(e) => setTeacherKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setTeacherKeyErr(null);
                        if (verifyTeacherUnlockCode(teacherKeyInput)) {
                          onChangeTeacherMode(true);
                          setTeacherKeyInput('');
                        } else {
                          setTeacherKeyErr('解除キーが正しくありません。');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="cm-btn-primary-xs"
                    onClick={() => {
                      setTeacherKeyErr(null);
                      if (verifyTeacherUnlockCode(teacherKeyInput)) {
                        onChangeTeacherMode(true);
                        setTeacherKeyInput('');
                      } else {
                        setTeacherKeyErr('解除キーが正しくありません。');
                      }
                    }}
                  >
                    <Unlock size={13} /> 解除
                  </button>
                </div>
                {teacherKeyErr && <div className="cm-error-box">{teacherKeyErr}</div>}
              </>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
