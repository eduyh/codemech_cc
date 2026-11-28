import type { MutableRefObject } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Eye,
  Lightbulb,
  Lock,
  Play,
  RotateCcw,
  Sparkles,
  Unlock,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  CURRICULUM_LESSONS,
  CURRICULUM_MISSIONS,
  CURRICULUM_PARTS,
  CurriculumPartId,
} from '../data/curriculum';
import { getControlTierSpec } from '../data/parts';
import {
  CurriculumVerifyResult,
  buildCurriculumMissionScenario,
  verifyCurriculumMission,
} from '../engine/curriculumVerifier';
import {
  ArenaPresetId,
  CurriculumStepId,
  MechBlueprint,
  MechSensorState,
  PilotDebugTrace,
  PilotProfile,
  ProgramRomEntry,
} from '../types/mech';
import { buildCurriculumClearCodePayload, encodeClearCode } from '../utils/clearCode';
import { UserProfile, getShortUserId } from '../utils/userProfile';
import {
  CurriculumProgressMap,
  FailedAttemptRejectReason,
  MODEL_ANSWER_REQUIRED_ATTEMPTS,
  extractClearedStepIds,
  getMissionProgressEntry,
  isModelAnswerUnlocked,
  loadCurriculumProgress,
  markCurriculumHintViewed,
  recordCurriculumAttempt,
  saveCurriculumProgress,
} from '../utils/curriculumProgress';
import { fullProgramToPython } from '../utils/gridPython';
import { ReplayPackageData } from '../utils/shareMech';
import { CurriculumMechEditor } from './CurriculumMechEditor';
import { GridProgramEditor } from './GridProgramEditor';

export interface MissionArenaSyncPayload {
  missionId: CurriculumStepId;
  stageCode: string;
  title: string;
  arenaPreset: ArenaPresetId;
  seed: number;
  replay: ReplayPackageData;
}

interface CurriculumPanelProps {
  allRoms: readonly ProgramRomEntry[];
  userProfile: UserProfile;
  teacherMode?: boolean;
  debugTrace: PilotDebugTrace | null;
  liveSensor: MechSensorState | null;
  onSyncMissionArena: (payload: MissionArenaSyncPayload, autoPlay: boolean) => void;
  runTestRef?: MutableRefObject<(() => void) | null>;
}

interface MissionDraft {
  mech: MechBlueprint;
  pilot: PilotProfile;
}

function rejectReasonLabel(reason: FailedAttemptRejectReason): string | null {
  switch (reason) {
    case 'empty_program':
      return 'プログラムが空（初期移動・命令なし）のため失敗回数にカウントされませんでした。';
    case 'unchanged_starter':
      return '課題の初期状態から変更されていないため失敗回数にカウントされませんでした。';
    case 'duplicate_attempt':
      return '前回と同じ内容のプログラムでの再実行のためカウントされませんでした（別の修正を試してください）。';
    default:
      return null;
  }
}

export function CurriculumPanel({
  allRoms,
  userProfile,
  teacherMode = false,
  debugTrace,
  liveSensor,
  onSyncMissionArena,
  runTestRef,
}: CurriculumPanelProps) {
  const [activePart, setActivePart] = useState<CurriculumPartId>('part1_basics');
  const [selectedId, setSelectedId] = useState<CurriculumStepId>('p1_1_capture_walk');
  const [drafts, setDrafts] = useState<Partial<Record<CurriculumStepId, MissionDraft>>>(() => ({
    p1_1_capture_walk: CURRICULUM_MISSIONS[0].buildBrokenStarter(),
  }));
  const [progressMap, setProgressMap] = useState<CurriculumProgressMap>(() =>
    loadCurriculumProgress()
  );
  const [lastResult, setLastResult] = useState<CurriculumVerifyResult | null>(null);
  const [attemptFeedback, setAttemptFeedback] = useState<string | null>(null);
  const [hintExpanded, setHintExpanded] = useState(false);
  const [solutionExpanded, setSolutionExpanded] = useState(false);
  const [workEditorTab, setWorkEditorTab] = useState<'program' | 'mech'>('program');
  const [selectorOpen, setSelectorOpen] = useState(true);

  const [copiedClear, setCopiedClear] = useState(false);

  const activeMission =
    CURRICULUM_MISSIONS.find((m) => m.id === selectedId) ?? CURRICULUM_MISSIONS[0];
  const currentDraft: MissionDraft =
    drafts[activeMission.id] ?? activeMission.buildBrokenStarter();
  const workMech = currentDraft.mech;
  const workPilot = currentDraft.pilot;

  const clearedSteps = extractClearedStepIds(progressMap);
  const missionEntry = getMissionProgressEntry(progressMap, activeMission.id);
  const modelAnswerUnlocked = isModelAnswerUnlocked(missionEntry, teacherMode);
  const lessonsInPart = CURRICULUM_LESSONS.filter((l) => l.part === activePart);

  const syncArenaForDraft = (
    mission: typeof activeMission,
    mech: MechBlueprint,
    pilot: PilotProfile,
    autoPlay: boolean
  ) => {
    const scenario = buildCurriculumMissionScenario(mission.id, mech, pilot);
    onSyncMissionArena(
      {
        missionId: mission.id,
        stageCode: mission.stageCode,
        title: mission.title,
        arenaPreset: mission.arenaPreset,
        seed: mission.seed,
        replay: scenario.replay,
      },
      autoPlay
    );
  };

  // Sync the right-hand battle screen whenever the selected mission changes (or on mount)
  useEffect(() => {
    const existing = drafts[activeMission.id];
    const draft = existing ?? activeMission.buildBrokenStarter();
    if (!existing) {
      setDrafts((prev) => ({ ...prev, [activeMission.id]: draft }));
    }
    syncArenaForDraft(activeMission, draft.mech, draft.pilot, false);
    // Reset to program editor in Part 1 (direct_4x4 has no hardware tuning missions)
    if (activeMission.part === 'part1_basics') {
      setWorkEditorTab('program');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMission.id]);

  const updateCurrentDraft = (nextMech: MechBlueprint, nextPilot: PilotProfile) => {
    setDrafts((prev) => ({
      ...prev,
      [activeMission.id]: { mech: nextMech, pilot: nextPilot },
    }));
    syncArenaForDraft(activeMission, nextMech, nextPilot, false);
  };

  const handleSelectMission = (missionId: CurriculumStepId) => {
    setSelectedId(missionId);
    setLastResult(null);
    setAttemptFeedback(null);
    setHintExpanded(false);
    setSolutionExpanded(false);
  };

  const handleSelectPart = (partId: CurriculumPartId) => {
    setActivePart(partId);
    const firstInPart = CURRICULUM_MISSIONS.find((m) => m.part === partId);
    if (firstInPart && activeMission.part !== partId) {
      handleSelectMission(firstInPart.id);
    }
  };

  const handleToggleHint = () => {
    const nextOpen = !hintExpanded;
    setHintExpanded(nextOpen);
    if (nextOpen && !teacherMode && !missionEntry.hintViewed) {
      const nextMap = markCurriculumHintViewed(progressMap, activeMission.id);
      setProgressMap(nextMap);
      saveCurriculumProgress(nextMap);
    }
  };

  const handleResetToStarter = () => {
    const fresh = activeMission.buildBrokenStarter();
    setLastResult(null);
    setAttemptFeedback(null);
    updateCurrentDraft(fresh.mech, fresh.pilot);
  };

  const handleRunTest = () => {
    const res = verifyCurriculumMission(activeMission.id, workMech, workPilot);
    setLastResult(res);

    const rec = recordCurriculumAttempt(
      progressMap,
      activeMission.id,
      activeMission.buildBrokenStarter,
      workMech,
      workPilot,
      res.passed,
      teacherMode
    );
    if (!teacherMode) {
      setProgressMap(rec.nextProgress);
      saveCurriculumProgress(rec.nextProgress);
    }

    if (teacherMode) {
      setAttemptFeedback(
        '教員モード中の実行のため、クリア実績・失敗回数・クリアコードには記録されません。'
      );
    } else if (res.passed) {
      setAttemptFeedback(null);
    } else if (rec.countedAsFailedAttempt) {
      const count = rec.entry.failedHashes.length;
      if (rec.unlockedNow) {
        setAttemptFeedback('異なる失敗試行が 5 回に達し、模範解答が解放されました！');
      } else if (count >= MODEL_ANSWER_REQUIRED_ATTEMPTS && !rec.entry.hintViewed) {
        setAttemptFeedback(
          `異なる失敗試行 ${count}/${MODEL_ANSWER_REQUIRED_ATTEMPTS}回達成。上の「ヒントを見る」を開くと模範解答が解放されます。`
        );
      } else {
        setAttemptFeedback(
          `新しい修正案の失敗を記録しました（異なる失敗試行 ${Math.min(count, MODEL_ANSWER_REQUIRED_ATTEMPTS)}/${MODEL_ANSWER_REQUIRED_ATTEMPTS}回）。`
        );
      }
    } else {
      setAttemptFeedback(rejectReasonLabel(rec.rejectReason));
    }

    onSyncMissionArena(
      {
        missionId: activeMission.id,
        stageCode: activeMission.stageCode,
        title: activeMission.title,
        arenaPreset: activeMission.arenaPreset,
        seed: activeMission.seed,
        replay: res.replay,
      },
      true
    );
  };

  if (runTestRef) {
    runTestRef.current = handleRunTest;
  }

  useEffect(() => {
    return () => {
      if (runTestRef) {
        runTestRef.current = null;
      }
    };
  }, [runTestRef]);

  const handleApplyModelSolution = () => {
    if (!modelAnswerUnlocked) return;
    const sol = activeMission.buildModelSolution();
    setLastResult(null);
    setAttemptFeedback('模範解答を課題エディタへ反映しました。テスト実行で動作を確認できます。');
    updateCurrentDraft(sol.mech, sol.pilot);
  };

  const clearPayload = useMemo(
    () => buildCurriculumClearCodePayload(userProfile, progressMap),
    [userProfile, progressMap]
  );

  const clearCode = useMemo(() => encodeClearCode(clearPayload), [clearPayload]);

  const handleCopyClearCode = async () => {
    try {
      await navigator.clipboard.writeText(clearCode);
      setCopiedClear(true);
      setTimeout(() => setCopiedClear(false), 1500);
    } catch {
      // Ignore clipboard failure
    }
  };

  const activeSolution =
    modelAnswerUnlocked && solutionExpanded ? activeMission.buildModelSolution() : null;

  return (
    <section className="cm-panel cm-curr-panel">
      <div className="cm-panel-head">
        <h2 className="cm-panel-title">
          学習課題カリキュラム（全2部・8コマ・{CURRICULUM_MISSIONS.length}ステージ）
        </h2>
        <div className="cm-curr-head-right">
          <button
            type="button"
            className="cm-btn-xs"
            onClick={() => setSelectorOpen((v) => !v)}
          >
            {selectorOpen ? 'ステージ一覧を折りたたむ' : `ステージ切替 (${activeMission.stageCode})`}
          </button>
          <span className="cm-pill">
            <Award size={14} /> {clearedSteps.length} / {CURRICULUM_MISSIONS.length} クリア
          </span>
        </div>
      </div>

      {selectorOpen && (
        <>
          <div className="cm-curr-part-tabs" role="tablist">
            {CURRICULUM_PARTS.map((part) => {
              const partMissions = CURRICULUM_MISSIONS.filter((m) => m.part === part.id);
              const partCleared = partMissions.filter((m) => clearedSteps.includes(m.id)).length;
              return (
                <button
                  key={part.id}
                  type="button"
                  className={`cm-curr-part-tab ${activePart === part.id ? 'is-active' : ''}`}
                  onClick={() => handleSelectPart(part.id)}
                  title={part.subtitle}
                >
                  <BookOpen size={14} />
                  <span>{part.label}</span>
                  <span className="cm-curr-part-count">
                    {partCleared}/{partMissions.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="cm-curr-lessons">
            {lessonsInPart.map((lesson) => {
              const stageList = CURRICULUM_MISSIONS.filter(
                (m) => m.lessonNumber === lesson.lessonNumber
              );
              return (
                <div key={lesson.lessonNumber} className="cm-curr-lesson-row">
                  <div className="cm-curr-lesson-head">
                    <strong>{lesson.title}</strong>
                    <span>{lesson.durationMin}分</span>
                  </div>
                  <div className="cm-curr-tabs">
                    {stageList.map((m) => {
                      const isCleared = clearedSteps.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`cm-curr-tab ${m.id === activeMission.id ? 'is-active' : ''} ${
                            isCleared ? 'is-cleared' : ''
                          }`}
                          onClick={() => handleSelectMission(m.id)}
                        >
                          <span>{m.stageCode}</span>
                          {isCleared && <CheckCircle2 size={13} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="cm-curr-card">
        <div className="cm-curr-card-head">
          <h3>{activeMission.title}</h3>
          <span className="cm-tier-badge">
            {getControlTierSpec(activeMission.controlTier).shortLabel}
          </span>
        </div>
        <p className="cm-curr-sub">
          {activeMission.subtitle} （テーマ: <strong>{activeMission.csConcept}</strong>）
        </p>
        <div className="cm-curr-goal">
          <strong>達成目標:</strong> {activeMission.goal}
        </div>

        <div className="cm-curr-hint-wrap">
          <button
            type="button"
            className={`cm-btn-secondary cm-curr-hint-btn ${hintExpanded ? 'is-open' : ''}`}
            onClick={handleToggleHint}
          >
            <Lightbulb size={14} />
            {hintExpanded ? 'ヒントを閉じる' : 'ヒントを見る'}
            {missionEntry.hintViewed && <span className="cm-curr-viewed-tag">閲覧済</span>}
          </button>
          {hintExpanded && (
            <div className="cm-curr-hint">
              <strong>ヒント:</strong> {activeMission.hint}
            </div>
          )}
        </div>

        <div className="cm-curr-actions">
          <button type="button" className="cm-btn-secondary" onClick={handleResetToStarter}>
            <RotateCcw size={14} /> 初期課題に戻す
          </button>
          <button type="button" className="cm-btn-primary" onClick={handleRunTest}>
            <Play size={15} /> 課題実行（自動判定＆再生）
          </button>
        </div>

        {attemptFeedback && <div className="cm-curr-attempt-note">{attemptFeedback}</div>}

        <div className={`cm-curr-answer-gate ${modelAnswerUnlocked ? 'is-unlocked' : 'is-locked'}`}>
          <div className="cm-curr-answer-head">
            <div className="cm-curr-answer-title">
              {modelAnswerUnlocked ? <Unlock size={14} /> : <Lock size={14} />}
              <span>
                模範解答 ({teacherMode ? '教員モード解放' : modelAnswerUnlocked ? '解放済' : 'ロック中'})
              </span>
            </div>
            <div className="cm-curr-answer-reqs">
              <span className={`cm-curr-req-pill ${missionEntry.hintViewed ? 'is-met' : ''}`}>
                ヒント閲覧 {missionEntry.hintViewed ? '✓' : '未'}
              </span>
              <span
                className={`cm-curr-req-pill ${
                  missionEntry.failedHashes.length >= MODEL_ANSWER_REQUIRED_ATTEMPTS ? 'is-met' : ''
                }`}
              >
                異なる失敗試行 {Math.min(missionEntry.failedHashes.length, MODEL_ANSWER_REQUIRED_ATTEMPTS)}/
                {MODEL_ANSWER_REQUIRED_ATTEMPTS}
              </span>
            </div>
          </div>

          {!modelAnswerUnlocked ? (
            <div className="cm-curr-answer-locked-note">
              ヒントを閲覧した上で、空や初期状態・同一プログラムの再実行ではない<strong>5通りの誤った修正案</strong>を実行すると模範解答が表示されます。
            </div>
          ) : (
            <div className="cm-curr-answer-body">
              <div className="cm-curr-actions">
                <button
                  type="button"
                  className="cm-btn-secondary"
                  onClick={() => setSolutionExpanded((v) => !v)}
                >
                  <Eye size={14} />
                  {solutionExpanded ? '模範解答を隠す' : '模範解答を見る'}
                </button>
                <button type="button" className="cm-btn-primary-xs" onClick={handleApplyModelSolution}>
                  <Sparkles size={14} /> 模範解答をこの課題に反映
                </button>
              </div>
              {activeSolution && (
                <div className="cm-curr-solution-box">
                  <div className="cm-curr-solution-summary">
                    <strong>解説:</strong> {activeMission.modelSolutionSummary}
                  </div>
                  <pre className="cm-curr-solution-code">
                    {fullProgramToPython(activeSolution.pilot, activeSolution.mech)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {lastResult && lastResult.missionId === activeMission.id && (
          <div className={`cm-curr-result ${lastResult.passed ? 'is-pass' : 'is-fail'}`}>
            <div className="cm-curr-res-head">
              {lastResult.passed
                ? `合格！ ${activeMission.stageCode} クリア`
                : '未達成 — 条件とヒントを確認してください'}
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

      {/* Embedded Self-Contained Mission Workbench (No leaving Curriculum page) */}
      <div className="cm-curr-workbench">
        <div className="cm-curr-wb-head">
          <div className="cm-curr-editor-tabs">
            <button
              type="button"
              className={`cm-curr-editor-tab ${workEditorTab === 'program' ? 'is-active' : ''}`}
              onClick={() => setWorkEditorTab('program')}
            >
              <Code2 size={14} /> 課題プログラム編集
            </button>
            {activeMission.part === 'part2_tactics' && (
              <button
                type="button"
                className={`cm-curr-editor-tab ${workEditorTab === 'mech' ? 'is-active' : ''}`}
                onClick={() => setWorkEditorTab('mech')}
              >
                <Wrench size={14} /> 課題機体装備・装甲
              </button>
            )}
          </div>
          <span className="cm-curr-wb-note">
            変更内容はそのままこの課題専用に保存され、右のバトル画面にも即時反映されます
          </span>
        </div>

        {workEditorTab === 'program' ? (
          <GridProgramEditor
            key={`curr_prog_${activeMission.id}`}
            pilot={workPilot}
            mech={workMech}
            allRoms={allRoms}
            debugTrace={debugTrace}
            liveSensor={liveSensor}
            hideRomLibrary
            onChangePilot={(nextPilot) => updateCurrentDraft(workMech, nextPilot)}
            onChangeMech={(nextMech) => updateCurrentDraft(nextMech, workPilot)}
          />
        ) : (
          <CurriculumMechEditor
            mech={workMech}
            onChange={(nextMech) => updateCurrentDraft(nextMech, workPilot)}
          />
        )}
      </div>

      <div className="cm-curr-clearbox">
        <div className="cm-curr-clearcode-meta">
          <span className="cm-subhead" style={{ margin: 0 }}>
            提出用クリアコード (CMK1-)
          </span>
          <span>
            コールサイン: <strong>{userProfile.userName}</strong> (#{getShortUserId(userProfile.userId)}) ・{' '}
            進捗 <strong>{clearedSteps.length}/{CURRICULUM_MISSIONS.length}</strong>
            （第1部 {clearPayload.part1Cleared ?? 0}/12 ・ 第2部 {clearPayload.part2Cleared ?? 0}/12）
          </span>
        </div>
        <div className="cm-curr-clearcode-row">
          <input
            type="text"
            readOnly
            aria-label="提出用クリアコード"
            className="cm-curr-clearcode-text"
            value={clearCode}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="cm-btn-primary-xs" onClick={handleCopyClearCode}>
            {copiedClear ? <Check size={13} /> : <Copy size={13} />}
            {copiedClear ? 'コピー済' : 'コピー'}
          </button>
        </div>
      </div>
    </section>
  );
}
