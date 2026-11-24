import { useEffect, useState } from 'react';
import { Check, Copy, Download, Lock, Upload, X } from 'lucide-react';
import { MechBlueprint, PilotProfile } from '../types/mech';
import {
  decodeChallengeCode,
  decodeMechCode,
  decodePilotCode,
  detectShareCodeKind,
  encodeChallengeCode,
  encodeMechCode,
  encodePilotCode,
  formatMechSubmissionText,
  parseMechFileText,
  serializeMechFile,
} from '../utils/shareMech';

interface ShareModalProps {
  open: boolean;
  mech: MechBlueprint;
  pilot: PilotProfile;
  onClose: () => void;
  onImportMechAndPilot: (mech: MechBlueprint, pilot: PilotProfile) => void;
  onImportPilotOnly: (pilot: PilotProfile) => void;
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ShareModal({
  open,
  mech,
  pilot,
  onClose,
  onImportMechAndPilot,
  onImportPilotOnly,
}: ShareModalProps) {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [teamTag, setTeamTag] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const pkg = { mech, pilot, teamTag: teamTag.trim() || undefined };
  const normalCode = encodeMechCode(pkg, { battleOnly: false });
  const battleOnlyCode = encodeMechCode(pkg, { battleOnly: true });
  const pilotCode = encodePilotCode(pilot);
  const challengeCode = encodeChallengeCode({
    title: `${mech.name} からの挑戦状`,
    teamTag: teamTag.trim() || undefined,
    challengers: [pkg],
  });
  const chatCard = formatMechSubmissionText(pkg);

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
    } catch {
      setErrorMsg('クリップボードへのコピーに失敗しました。手動でコピーしてください。');
    }
  };

  const handleImportCode = () => {
    setErrorMsg(null);
    setStatusMsg(null);
    const trimmed = importText.trim();
    if (!trimmed) {
      setErrorMsg('コードまたは JSON を入力してください。');
      return;
    }

    try {
      const kind = detectShareCodeKind(trimmed);
      if (kind === 'battle_only') {
        const decoded = decodeMechCode(trimmed);
        setErrorMsg(
          `「${decoded.mech.name}」は対戦専用コード (CMM1B-) のためスタジオでは中身を開けません。Battlefield 画面へ取り込んで対戦してください。`
        );
        return;
      }
      if (kind === 'mech') {
        const decoded = decodeMechCode(trimmed);
        onImportMechAndPilot(decoded.mech, decoded.pilot);
        setStatusMsg(`機体「${decoded.mech.name}」とパイロットを読み込みました。`);
        return;
      }
      if (kind === 'pilot') {
        const decodedPilot = decodePilotCode(trimmed);
        onImportPilotOnly(decodedPilot);
        setStatusMsg(`パイロット「${decodedPilot.name}」を現在の機体へ乗り換え読み込みしました。`);
        return;
      }
      if (kind === 'challenge') {
        const ch = decodeChallengeCode(trimmed);
        const first = ch.challengers[0];
        if (first.battleOnly) {
          setErrorMsg('この挑戦状は対戦専用設定のためスタジオでは開けません。Battlefield 画面で読み込んでください。');
          return;
        }
        onImportMechAndPilot(first.mech, first.pilot);
        setStatusMsg(`挑戦状「${ch.title}」の先頭機体を読み込みました。`);
        return;
      }
      if (kind === 'json') {
        const parsed = parseMechFileText(trimmed);
        if (parsed.battleOnly) {
          setErrorMsg('対戦専用ファイルのためスタジオでは中身を開けません。');
          return;
        }
        onImportMechAndPilot(parsed.mech, parsed.pilot);
        setStatusMsg(`JSON から機体「${parsed.mech.name}」を読み込みました。`);
        return;
      }
      setErrorMsg('対応するコード接頭辞 (CMM1- / CMP1- / CMC1-) が見つかりません。');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '読み込みに失敗しました');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const text = await file.text();
      const parsed = parseMechFileText(text);
      if (parsed.battleOnly) {
        setErrorMsg('対戦専用ファイルのためスタジオでは開けません。Battlefield で読み込んでください。');
        return;
      }
      onImportMechAndPilot(parsed.mech, parsed.pilot);
      setStatusMsg(`ファイル「${file.name}」を読み込みました。`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ファイル読み込みに失敗しました');
    }
  };

  return (
    <div className="cm-modal-backdrop" onClick={onClose}>
      <div
        className="cm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="機体・パイロット共有"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cm-modal-head">
          <h2>共有・提出・読み込み（オフライン閉域対応）</h2>
          <button type="button" className="cm-icon-btn" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </div>

        <div className="cm-seg" style={{ marginBottom: '0.75rem' }}>
          <button
            type="button"
            className={tab === 'export' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
            onClick={() => setTab('export')}
          >
            書き出し・共有
          </button>
          <button
            type="button"
            className={tab === 'import' ? 'cm-seg-btn is-active' : 'cm-seg-btn'}
            onClick={() => setTab('import')}
          >
            読込・取込
          </button>
        </div>

        {tab === 'export' ? (
          <div className="cm-share-body">
            <label className="cm-field">
              <span>チームタグ (任意)</span>
              <input
                type="text"
                placeholder="例: A班"
                value={teamTag}
                onChange={(e) => setTeamTag(e.target.value)}
              />
            </label>

            <div className="cm-share-row">
              <div>
                <strong>通常シェアコード (CMM1-)</strong>
                <p>機体＋機体OS＋パイロットAIを統合共有（中身閲覧・編集可）</p>
              </div>
              <button
                type="button"
                className="cm-btn-secondary"
                onClick={() => copyValue('normal', normalCode)}
              >
                {copiedKey === 'normal' ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey === 'normal' ? 'コピー済' : 'コピー'}
              </button>
            </div>

            <div className="cm-share-row">
              <div>
                <strong>
                  <Lock size={13} style={{ verticalAlign: '-2px' }} /> 対戦専用コード (CMM1B-)
                </strong>
                <p>中身非公開・難読化（スタジオでの閲覧をガードし大会対戦のみ許可）</p>
              </div>
              <button
                type="button"
                className="cm-btn-secondary"
                onClick={() => copyValue('battle', battleOnlyCode)}
              >
                {copiedKey === 'battle' ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey === 'battle' ? 'コピー済' : 'コピー'}
              </button>
            </div>

            <div className="cm-share-row">
              <div>
                <strong>パイロット単体コード (CMP1-)</strong>
                <p>AI思考だけを取り出して他人の機体へ乗り換え検証</p>
              </div>
              <button
                type="button"
                className="cm-btn-secondary"
                onClick={() => copyValue('pilot', pilotCode)}
              >
                {copiedKey === 'pilot' ? <Check size={14} /> : <Copy size={14} />}
                {copiedKey === 'pilot' ? 'コピー済' : 'コピー'}
              </button>
            </div>

            <div className="cm-share-row">
              <div>
                <strong>挑戦状コード (CMC1-) / チャット提出カード</strong>
                <p>Slack・Teams・メール貼付向け折り返し耐性付きテキスト</p>
              </div>
              <div className="cm-btn-group">
                <button
                  type="button"
                  className="cm-btn-secondary"
                  onClick={() => copyValue('challenge', challengeCode)}
                >
                  {copiedKey === 'challenge' ? <Check size={14} /> : <Copy size={14} />} 挑戦状
                </button>
                <button
                  type="button"
                  className="cm-btn-primary-xs"
                  onClick={() => copyValue('card', chatCard)}
                >
                  {copiedKey === 'card' ? <Check size={14} /> : <Copy size={14} />} 提出カード
                </button>
              </div>
            </div>

            <div className="cm-share-row">
              <div>
                <strong>JSON ファイル保存</strong>
                <p>mechs_user/ フォルダへの保管用</p>
              </div>
              <button
                type="button"
                className="cm-btn-secondary"
                onClick={() =>
                  downloadTextFile(`${mech.name.replace(/\s+/g, '_')}.cmmech.json`, serializeMechFile(pkg))
                }
              >
                <Download size={14} /> .cmmech.json 保存
              </button>
            </div>
          </div>
        ) : (
          <div className="cm-share-body">
            <textarea
              className="cm-share-textarea"
              placeholder="CMM1-... / CMP1-... / CMC1-... または >>>...<<< カード、JSON を貼り付けてください"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="cm-modal-actions">
              <label className="cm-btn-secondary">
                <Upload size={14} /> ファイル読込
                <input
                  type="file"
                  accept=".json,.txt"
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />
              </label>
              <button type="button" className="cm-btn-primary" onClick={handleImportCode}>
                貼り付けたコードを読み込む
              </button>
            </div>
          </div>
        )}

        {errorMsg && <div className="cm-error-box">{errorMsg}</div>}
        {statusMsg && <div className="cm-ok-box">{statusMsg}</div>}
      </div>
    </div>
  );
}
