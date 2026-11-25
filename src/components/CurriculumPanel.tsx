import { useState } from 'react';
import {
  Award,
  Bug,
  Check,
  CheckCircle2,
  Copy,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { CURRICULUM_MISSIONS } from '../data/curriculum';
import { getControlTierSpec } from '../data/parts';
import { CurriculumVerifyResult, verifyCurriculumMission } from '../engine/curriculumVerifier';
import {
  ArenaPresetId,
  CurriculumStepId,
  MechBlueprint,
  PilotProfile,
} from '../types/mech';
import { ClearCodePayload, decodeClearCode, encodeClearCode } from '../utils/clearCode';
import { ReplayPackageData } from '../utils/shareMech';

interface CurriculumPanelProps {
  playerMech: MechBlueprint;
  playerPilot: PilotProfile;
  onPlayMissionReplay: (replay: ReplayPackageData) => void;
  onLoadBrokenStarter: (
    mech: MechBlueprint,
    pilot: PilotProfile,
    arenaPreset: ArenaPresetId,
    seed: number
  ) => void;
}

const STORAGE_KEY = 'codemech_curriculum_v2';

function loadClearedSteps(): CurriculumStepId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveClearedSteps(steps: CurriculumStepId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function CurriculumPanel({
  playerMech,
  playerPilot,
  onPlayMissionReplay,
  onLoadBrokenStarter,
}: CurriculumPanelProps) {
  const [selectedId, setSelectedId] = useState<CurriculumStepId>('step0_robot_4x4');
  const [clearedSteps, setClearedSteps] = useState<CurriculumStepId[]>(() => loadClearedSteps());
  const [lastResult, setLastResult] = useState<CurriculumVerifyResult | null>(null);

  const [studentName, setStudentName] = useState('');
  const [copiedClear, setCopiedClear] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [verifiedPayload, setVerifiedPayload] = useState<ClearCodePayload | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const activeMission =
    CURRICULUM_MISSIONS.find((m) => m.id === selectedId) ?? CURRICULUM_MISSIONS[0];

  const handleRunTest = () => {
    const res = verifyCurriculumMission(activeMission.id, playerMech, playerPilot);
    setLastResult(res);
    if (res.passed && !clearedSteps.includes(activeMission.id)) {
      const next = [...clearedSteps, activeMission.id];
      setClearedSteps(next);
      saveClearedSteps(next);
    }
    onPlayMissionReplay(res.replay);
  };

  const handleLoadBuggyStarter = () => {
    const starter = activeMission.buildBrokenStarter();
    onLoadBrokenStarter(starter.mech, starter.pilot, activeMission.arenaPreset, activeMission.seed);
  };

  const clearCode = encodeClearCode({
    studentName: studentName.trim() || 'Student',
    clearedSteps,
    issuedAt: new Date().toISOString(),
  });

  const handleCopyClearCode = async () => {
    try {
      await navigator.clipboard.writeText(clearCode);
      setCopiedClear(true);
      setTimeout(() => setCopiedClear(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDecodeClearCode = () => {
    setVerifyError(null);
    setVerifiedPayload(null);
    try {
      const decoded = decodeClearCode(verifyInput);
      setVerifiedPayload(decoded);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'クリアコードの検証に失敗しました');
    }
  };

  return (
    <section className="cm-panel">
      <div className="cm-panel-head">
        <div>
          <h2 className="cm-panel-title">
            段階的デバッグ学習カリキュラム（全{CURRICULUM_MISSIONS.length}ステップ）
          </h2>
          <p className="cm-panel-sub">
            ロボット 4×4 単体 → 4×4 分岐＆防御 → パイロット 6×6 ＋ 4×4 ROM 最大5枠の順で段階的に学びます
          </p>
        </div>
        <span className="cm-pill">
          <Award size={14} /> {clearedSteps.length} / {CURRICULUM_MISSIONS.length} クリア
        </span>
      </div>

      <div className="cm-curr-tabs">
        {CURRICULUM_MISSIONS.map((m) => {
          const isCleared = clearedSteps.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              className={`cm-curr-tab ${m.id === activeMission.id ? 'is-active' : ''} ${
                isCleared ? 'is-cleared' : ''
              }`}
              onClick={() => {
                setSelectedId(m.id);
                setLastResult(null);
              }}
            >
              <span>Step {m.stepNumber}</span>
              {isCleared && <CheckCircle2 size={13} />}
            </button>
          );
        })}
      </div>

      <div className="cm-curr-card">
        <div className="cm-curr-card-head">
          <h3>{activeMission.title}</h3>
          <span className="cm-tier-badge">
            {getControlTierSpec(activeMission.controlTier).shortLabel}
          </span>
        </div>
        <p className="cm-curr-sub">
          {activeMission.subtitle} （学習テーマ: <strong>{activeMission.csConcept}</strong>）
        </p>
        <div className="cm-curr-goal">
          <strong>達成目標:</strong> {activeMission.goal}
        </div>
        <div className="cm-curr-hint">
          <strong>ヒント:</strong> {activeMission.hint}
        </div>

        <div className="cm-curr-actions">
          <button
            type="button"
            className="cm-btn-secondary"
            onClick={handleLoadBuggyStarter}
          >
            <Bug size={14} /> バグ入り課題をエディタに読み込む
          </button>
          <button type="button" className="cm-btn-primary" onClick={handleRunTest}>
            <Play size={15} /> 課題テスト実行（自動判定＆3D再生）
          </button>
        </div>

        {lastResult && lastResult.missionId === activeMission.id && (
          <div className={`cm-curr-result ${lastResult.passed ? 'is-pass' : 'is-fail'}`}>
            <div className="cm-curr-res-head">
              {lastResult.passed ? '合格！ステップクリア' : '未達成 — 条件を確認してください'}
              <span>({lastResult.durationSec.toFixed(1)}s)</span>
            </div>
            <ul className="cm-curr-checklist">
              {lastResult.checklist.map((item, idx) => (
                <li key={idx} className={item.ok ? 'is-ok' : 'is-ng'}>
                  {item.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
            <div className="cm-curr-summary">{lastResult.summaryText}</div>
          </div>
        )}
      </div>

      <div className="cm-curr-clearbox">
        <div className="cm-subhead">提出用クリアコード (CMK1-)</div>
        <div className="cm-bf-rule-share">
          <input
            type="text"
            className="cm-mini-select"
            placeholder="氏名 / 学籍番号"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
          />
          <button type="button" className="cm-btn-primary-xs" onClick={handleCopyClearCode}>
            {copiedClear ? <Check size={13} /> : <Copy size={13} />}
            {copiedClear ? 'コピー済' : 'CMK1- コピー'}
          </button>
        </div>

        <div className="cm-subhead" style={{ marginTop: '0.55rem' }}>
          教員向けクリアコード確認
        </div>
        <div className="cm-bf-rule-share">
          <input
            type="text"
            className="cm-mini-select"
            style={{ flex: 1 }}
            placeholder="CMK1-... を貼り付けて真贋確認"
            value={verifyInput}
            onChange={(e) => setVerifyInput(e.target.value)}
          />
          <button type="button" className="cm-btn-xs" onClick={handleDecodeClearCode}>
            <ShieldCheck size={13} /> 確認
          </button>
        </div>
        {verifyError && <div className="cm-error-box">{verifyError}</div>}
        {verifiedPayload && (
          <div className="cm-ok-box">
            提出者: <strong>{verifiedPayload.studentName}</strong> / 達成数:{' '}
            {verifiedPayload.clearedSteps.length} ({verifiedPayload.clearedSteps.join(', ') || 'なし'})
          </div>
        )}
      </div>
    </section>
  );
}
