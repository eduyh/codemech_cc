import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Lock,
  Play,
  Plus,
  Save,
  Shuffle,
  Swords,
  Trash2,
} from 'lucide-react';
import { computeMechStats, getArmWeaponSpec, getShoulderWeaponSpec } from '../data/parts';
import { DEFAULT_PILOT_PROFILE, PRESET_ABC, STARTER_MECHS } from '../data/presets';
import { MechBlueprint, PilotProfile, ProgramRomEntry } from '../types/mech';
import { SavedCustomMech, formatCustomMechName, formatMechDropdownLabel } from '../utils/customMechStorage';
import { isBuiltInPilotId } from '../utils/pilotLibrary';
import {
  DEFAULT_TEAM_TONNAGE_CAP,
  SavedTeamEntry,
  SavedTeamMember,
  TEAM_SQUAD_SIZE,
  buildRandomSquad,
  computeTeamTonnage,
  evaluateTeamTonnageLimit,
  formatTeamSubmissionText,
  getMechChassisTonnage,
  resolveTeamMemberAssets,
} from '../utils/teamStorage';
import {
  DEFAULT_USER_NAME,
  buildDefaultTeamName,
  cleanTeamName,
  resolveUniqueTeamName,
} from '../utils/userProfile';

interface TeamBuilderPanelProps {
  savedTeams: readonly SavedTeamEntry[];
  savedMechs: readonly SavedCustomMech[];
  allPilots: readonly PilotProfile[];
  allRoms: readonly ProgramRomEntry[];
  userName: string;
  userId: string;
  onOpenUserMenu: () => void;
  onSaveTeam: (input: {
    id?: string;
    name: string;
    members: readonly SavedTeamMember[];
    userName?: string;
    userId?: string;
  }) => { saved: SavedTeamEntry; updated: boolean };
  onDeleteTeam: (teamId: string) => void;
  onTestTeamInStudio: (
    teamName: string,
    members: Array<{ mech: MechBlueprint; pilot: PilotProfile; mechEntryId: string }>
  ) => void;
  onRegisterToBattlefield: (team: SavedTeamEntry) => void;
}

function createInitialMembers(savedMechs: readonly SavedCustomMech[]): SavedTeamMember[] {
  const m0 = savedMechs[0]?.id ?? STARTER_MECHS[0]?.id ?? PRESET_ABC.id;
  const m1 = STARTER_MECHS[1]?.id ?? m0;
  const m2 = STARTER_MECHS[2]?.id ?? m0;
  const pickPilot = (mechId: string): string => {
    const custom = savedMechs.find((m) => m.id === mechId);
    if (custom?.pilotId) return custom.pilotId;
    const starter = STARTER_MECHS.find((m) => m.id === mechId);
    return starter?.defaultPilotId ?? DEFAULT_PILOT_PROFILE.id;
  };
  return [
    { mechId: m0, pilotId: pickPilot(m0) },
    { mechId: m1, pilotId: pickPilot(m1) },
    { mechId: m2, pilotId: pickPilot(m2) },
  ];
}

export function TeamBuilderPanel({
  savedTeams,
  savedMechs,
  allPilots,
  allRoms,
  userName,
  userId,
  onOpenUserMenu,
  onSaveTeam,
  onDeleteTeam,
  onTestTeamInStudio,
  onRegisterToBattlefield,
}: TeamBuilderPanelProps) {
  const [editingTeamId, setEditingTeamId] = useState<string | undefined>(() => savedTeams[0]?.id);
  const [teamName, setTeamName] = useState<string>(
    () =>
      savedTeams[0]?.name ??
      buildDefaultTeamName(
        userName,
        savedTeams.map((t) => t.name),
        userId
      )
  );
  const [members, setMembers] = useState<SavedTeamMember[]>(() =>
    savedTeams[0]?.members?.length
      ? structuredClone(savedTeams[0].members.slice(0, TEAM_SQUAD_SIZE))
      : createInitialMembers(savedMechs)
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const userPilots = useMemo(() => allPilots.filter((p) => !isBuiltInPilotId(p.id)), [allPilots]);
  const starterPilots = useMemo(() => allPilots.filter((p) => isBuiltInPilotId(p.id)), [allPilots]);

  const resolvedMembers = useMemo(
    () => members.map((m) => resolveTeamMemberAssets(m, savedMechs, allPilots, allRoms)),
    [members, savedMechs, allPilots, allRoms]
  );

  const totalTonnage = useMemo(
    () => computeTeamTonnage(resolvedMembers.map((r) => r.mech)),
    [resolvedMembers]
  );
  const tonnageEval = useMemo(
    () => evaluateTeamTonnageLimit(totalTonnage, DEFAULT_TEAM_TONNAGE_CAP, false),
    [totalTonnage]
  );
  const tonnagePct = Math.min(100, Math.round((totalTonnage / DEFAULT_TEAM_TONNAGE_CAP) * 100));

  const handleChangeMemberMech = (slotIdx: number, nextMechId: string) => {
    const custom = savedMechs.find((m) => m.id === nextMechId);
    const starter = STARTER_MECHS.find((m) => m.id === nextMechId);
    const defaultPilot =
      custom?.pilotId ?? starter?.defaultPilotId ?? members[slotIdx]?.pilotId ?? DEFAULT_PILOT_PROFILE.id;
    setMembers((prev) =>
      prev.map((m, i) => (i === slotIdx ? { mechId: nextMechId, pilotId: defaultPilot } : m))
    );
    setErrorMsg(null);
    setNotice(null);
  };

  const handleChangeMemberPilot = (slotIdx: number, nextPilotId: string) => {
    setMembers((prev) =>
      prev.map((m, i) => (i === slotIdx ? { ...m, pilotId: nextPilotId } : m))
    );
    setErrorMsg(null);
    setNotice(null);
  };

  const handleLoadTeamForEdit = (team: SavedTeamEntry) => {
    setEditingTeamId(team.id);
    setTeamName(team.name);
    setMembers(structuredClone(team.members.slice(0, TEAM_SQUAD_SIZE)));
    setErrorMsg(null);
    setNotice(`チーム「${team.name}」を読み込みました。`);
  };

  const handleNewTeam = () => {
    setEditingTeamId(undefined);
    setTeamName(
      buildDefaultTeamName(
        userName,
        savedTeams.map((t) => t.name),
        userId
      )
    );
    setMembers(createInitialMembers(savedMechs));
    setErrorMsg(null);
    setNotice('新規3機小隊を作成中です。');
  };

  const handleRandomUnderCap = () => {
    const pool = [
      ...savedMechs.map((m) => {
        const res = resolveTeamMemberAssets(
          { mechId: m.id, pilotId: m.pilotId ?? DEFAULT_PILOT_PROFILE.id },
          savedMechs,
          allPilots,
          allRoms
        );
        return { ...res, id: m.id };
      }),
      ...STARTER_MECHS.map((bp) => {
        const res = resolveTeamMemberAssets(
          { mechId: bp.id, pilotId: bp.defaultPilotId ?? DEFAULT_PILOT_PROFILE.id },
          savedMechs,
          allPilots,
          allRoms
        );
        return { ...res, id: bp.id };
      }),
    ];
    const picked = buildRandomSquad(pool, TEAM_SQUAD_SIZE, DEFAULT_TEAM_TONNAGE_CAP, 1.2);
    // buildRandomSquad uses multiplier>=1.2 internally, so clamp down to 180t if slightly above 180t
    let nextMembers = picked.map((p) => ({ mechId: p.id, pilotId: p.pilotId }));
    const pickedSum = computeTeamTonnage(picked.map((p) => p.mech));
    if (pickedSum > DEFAULT_TEAM_TONNAGE_CAP) {
      const lightest = [...pool].sort(
        (a, b) => getMechChassisTonnage(a.mech) - getMechChassisTonnage(b.mech)
      );
      const safePicked: typeof pool = [];
      let rem = DEFAULT_TEAM_TONNAGE_CAP;
      for (let i = 0; i < TEAM_SQUAD_SIZE; i++) {
        const minRest = (TEAM_SQUAD_SIZE - i - 1) * getMechChassisTonnage(lightest[0].mech);
        const cands = lightest.filter((c) => getMechChassisTonnage(c.mech) <= rem - minRest);
        const src = cands.length > 0 ? cands : [lightest[0]];
        const chosen = src[Math.floor(Math.random() * src.length) % src.length];
        safePicked.push(chosen);
        rem -= getMechChassisTonnage(chosen.mech);
      }
      nextMembers = safePicked.map((p) => ({ mechId: p.id, pilotId: p.pilotId }));
    }
    setMembers(nextMembers);
    setErrorMsg(null);
    setNotice('180t以内のランダム3機編成を組みました。');
  };

  const handleSave = (asNew = false) => {
    setErrorMsg(null);
    setNotice(null);
    if (!tonnageEval.allowed) {
      setErrorMsg(
        `チーム合計重量が上限 (${DEFAULT_TEAM_TONNAGE_CAP}t) を ${tonnageEval.overBy}t 超過しています。構成を調整してください。`
      );
      return;
    }
    const res = onSaveTeam({
      id: asNew ? undefined : editingTeamId,
      name: teamName,
      members,
      userName,
      userId,
    });
    setEditingTeamId(res.saved.id);
    setTeamName(res.saved.name);
    setNotice(
      res.updated
        ? `チーム「${res.saved.name}」(${totalTonnage}t) を上書き保存しました。`
        : `チーム「${res.saved.name}」(${totalTonnage}t) を保存しました。`
    );
  };

  const handleRegisterAndOpenBattlefield = () => {
    setErrorMsg(null);
    if (!tonnageEval.allowed) {
      setErrorMsg(
        `チーム合計重量が上限 (${DEFAULT_TEAM_TONNAGE_CAP}t) を ${tonnageEval.overBy}t 超過しているためエントリーできません。`
      );
      return;
    }
    const res = onSaveTeam({
      id: editingTeamId,
      name: teamName,
      members,
      userName,
      userId,
    });
    setEditingTeamId(res.saved.id);
    setTeamName(res.saved.name);
    onRegisterToBattlefield(res.saved);
  };

  const handleCopySubmission = async (battleOnly: boolean) => {
    setErrorMsg(null);
    if (!tonnageEval.allowed) {
      setErrorMsg(
        `チーム合計重量が上限 (${DEFAULT_TEAM_TONNAGE_CAP}t) を超過しているため公式提出コードを出力できません。`
      );
      return;
    }
    const otherNames = savedTeams
      .filter((t) => t.id !== editingTeamId)
      .map((t) => t.name);
    const exportTag = cleanTeamName(teamName)
      ? resolveUniqueTeamName(cleanTeamName(teamName), [])
      : buildDefaultTeamName(userName, otherNames, userId);
    const txt = formatTeamSubmissionText(
      exportTag,
      resolvedMembers.map((r) => ({ mech: r.mech, pilot: r.pilot })),
      { battleOnly, authorName: userName || DEFAULT_USER_NAME, authorId: userId }
    );
    try {
      await navigator.clipboard.writeText(txt);
      const key = battleOnly ? 'battle' : 'normal';
      setCopiedKey(key);
      setNotice(
        battleOnly
          ? `非公開対戦コード (CMM1B-) 3機分を「#${teamName.trim() || '無名小隊'}」としてコピーしました。`
          : `通常提出コード (CMM1-) 3機分を「#${teamName.trim() || '無名小隊'}」としてコピーしました。`
      );
      setTimeout(() => setCopiedKey((p) => (p === key ? null : p)), 1500);
    } catch {
      setErrorMsg('クリップボードへのコピーに失敗しました。');
    }
  };

  return (
    <section className="cm-panel cm-team-panel">
      <div className="cm-panel-head">
        <div>
          <h2 className="cm-panel-title">チーム編成・エントリー登録（3機小隊 / 上限 {DEFAULT_TEAM_TONNAGE_CAP}t）</h2>
          <p className="cm-panel-sub">
            公式エントリー用の3機小隊（合計 {DEFAULT_TEAM_TONNAGE_CAP}t 以下）を組んで保存・試運転・バトルフィールド登録・提出コード出力が行えます。
          </p>
        </div>
        <div className="cm-btn-group">
          <button type="button" className="cm-btn-xs" onClick={handleNewTeam}>
            <Plus size={13} /> 新規チーム
          </button>
          <button type="button" className="cm-btn-xs" onClick={handleRandomUnderCap}>
            <Shuffle size={13} /> 180t以内ランダム
          </button>
        </div>
      </div>

      {userName === DEFAULT_USER_NAME && (
        <div className="cm-user-banner">
          <span>
            現在のユーザー名は既定の「{DEFAULT_USER_NAME}」です（小隊名に UUID 末尾が付きます）。右上のメニュー (≡) から自分のコールサインを設定できます。
          </span>
          <button type="button" className="cm-btn-xs" onClick={onOpenUserMenu}>
            コールサインを変更
          </button>
        </div>
      )}

      <div className="cm-team-layout">
        <div className="cm-team-editor-col">
          <div className="cm-team-header-card">
            <label className="cm-field cm-team-name-field">
              <span>チーム名（エントリータグ）</span>
              <input
                type="text"
                maxLength={24}
                placeholder={buildDefaultTeamName(userName, [], userId)}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
              {(() => {
                const otherNames = savedTeams
                  .filter((t) => t.id !== editingTeamId)
                  .map((t) => t.name);
                const clean = cleanTeamName(teamName);
                if (!clean) return null;
                const resolved = resolveUniqueTeamName(clean, otherNames);
                if (resolved !== clean) {
                  return (
                    <span className="cm-team-collision-hint">
                      ※ 同名チームがあるため保存時は「{resolved}」に自動調整されます
                    </span>
                  );
                }
                return null;
              })()}
            </label>

            <div className="cm-team-tonnage-box">
              <div className="cm-team-tonnage-top">
                <span>小隊合計トン数</span>
                <strong className={tonnageEval.allowed ? 'is-ok' : 'is-over'}>
                  {totalTonnage}t / {DEFAULT_TEAM_TONNAGE_CAP}t
                  {tonnageEval.allowed
                    ? ` (残り ${DEFAULT_TEAM_TONNAGE_CAP - totalTonnage}t)`
                    : ` (${tonnageEval.overBy}t 超過!)`}
                </strong>
              </div>
              <div className="cm-bar cm-bar--lg">
                <div
                  className={`cm-bar-fill ${tonnageEval.allowed ? 'cm-bar-en' : 'cm-bar-overheat'}`}
                  style={{ width: `${tonnagePct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="cm-team-slots">
            {resolvedMembers.map((res, idx) => {
              const member = members[idx];
              const ton = getMechChassisTonnage(res.mech);
              const stats = computeMechStats(res.mech);
              const weaponsSummary = [
                getArmWeaponSpec(res.mech.parts.rightArmWeapon),
                getArmWeaponSpec(res.mech.parts.leftArmWeapon),
                getShoulderWeaponSpec(res.mech.parts.rightShoulderWeapon),
                getShoulderWeaponSpec(res.mech.parts.leftShoulderWeapon),
              ]
                .filter((w) => w.id !== 'arm_none' && w.id !== 'shd_none')
                .map((w) => w.name)
                .join(' / ');

              return (
                <div key={`slot_${idx}`} className="cm-team-slot-card">
                  <div className="cm-team-slot-head">
                    <strong>{idx + 1}番機</strong>
                    <span className="cm-hud-meta-badge">フレーム {ton}t</span>
                  </div>

                  <label className="cm-select-row">
                    <span>機体</span>
                    <select
                      aria-label={`${idx + 1}番機 機体`}
                      value={res.mechEntryId}
                      onChange={(e) => handleChangeMemberMech(idx, e.target.value)}
                    >
                      {savedMechs.length > 0 && (
                        <optgroup label="ユーザー機体">
                          {savedMechs.map((m) => (
                            <option key={m.id} value={m.id}>
                              {formatMechDropdownLabel(
                                m.chassisId,
                                formatCustomMechName(m.baseName, m.tag)
                              )}{' '}
                              ({getMechChassisTonnage(m.blueprint)}t)
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="標準機体">
                        {STARTER_MECHS.map((bp) => (
                          <option key={bp.id} value={bp.id}>
                            {formatMechDropdownLabel(bp.chassisId, bp.name)} (
                            {getMechChassisTonnage(bp)}t)
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>

                  <label className="cm-select-row">
                    <span>パイロット</span>
                    <select
                      aria-label={`${idx + 1}番機 パイロット`}
                      value={member.pilotId}
                      onChange={(e) => handleChangeMemberPilot(idx, e.target.value)}
                    >
                      {userPilots.length > 0 && (
                        <optgroup label="自作パイロット">
                          {userPilots.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="標準パイロット">
                        {starterPilots.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>

                  <div className="cm-team-slot-meta">
                    <span>総装甲 {stats.totalArmorPoints}</span>
                    <span>実重量 {stats.totalWeight.toFixed(1)}/{stats.loadCapacity}t</span>
                    <span>速度 {stats.walkSpeed}m/s</span>
                  </div>
                  <div className="cm-team-slot-weapons">
                    武装: {weaponsSummary || 'なし'}
                  </div>
                </div>
              );
            })}
          </div>

          {!tonnageEval.allowed && (
            <div className="cm-error-box" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={15} />
              <span>
                小隊合計 {totalTonnage}t は手動編成の上限 {DEFAULT_TEAM_TONNAGE_CAP}t を超えています（{tonnageEval.overBy}t 削減してください）。
              </span>
            </div>
          )}
          {errorMsg && <div className="cm-error-box">{errorMsg}</div>}
          {notice && <div className="cm-ok-box">{notice}</div>}

          <div className="cm-team-actions">
            <button
              type="button"
              className="cm-btn-primary"
              disabled={!tonnageEval.allowed}
              onClick={() => handleSave(false)}
            >
              <Save size={14} /> {editingTeamId ? 'チーム上書き保存' : 'チーム保存'}
            </button>
            {editingTeamId && (
              <button
                type="button"
                className="cm-btn-secondary"
                disabled={!tonnageEval.allowed}
                onClick={() => handleSave(true)}
              >
                別名で新規保存
              </button>
            )}
            <button
              type="button"
              className="cm-btn-secondary"
              onClick={() =>
                onTestTeamInStudio(
                  teamName.trim() || '編成チーム',
                  resolvedMembers.map((r) => ({
                    mech: r.mech,
                    pilot: r.pilot,
                    mechEntryId: r.mechEntryId,
                  }))
                )
              }
            >
              <Play size={14} /> スタジオ 3vs3 で試運転
            </button>
            <button
              type="button"
              className="cm-btn-primary"
              disabled={!tonnageEval.allowed}
              onClick={handleRegisterAndOpenBattlefield}
            >
              <Swords size={14} /> バトルフィールドへ登録して開く
            </button>
          </div>

          <div className="cm-team-export-row">
            <button
              type="button"
              className="cm-btn-xs"
              disabled={!tonnageEval.allowed}
              onClick={() => handleCopySubmission(false)}
            >
              {copiedKey === 'normal' ? <Check size={12} /> : <Copy size={12} />} 提出コード一括コピー (CMM1-)
            </button>
            <button
              type="button"
              className="cm-btn-xs"
              disabled={!tonnageEval.allowed}
              onClick={() => handleCopySubmission(true)}
            >
              {copiedKey === 'battle' ? <Check size={12} /> : <Lock size={12} />} 非公開コード一括コピー (CMM1B-)
            </button>
          </div>
        </div>

        <aside className="cm-team-saved-col">
          <div className="cm-subhead">保存済みローカルチーム ({savedTeams.length} チーム)</div>
          {savedTeams.length === 0 ? (
            <div className="cm-team-empty">
              まだ保存済みチームがありません。左の3機構成を選んで「チーム保存」すると、バトルフィールドへワンクリック登録できます。
            </div>
          ) : (
            <div className="cm-team-saved-list">
              {savedTeams.map((team) => {
                const memAssets = team.members.map((m) =>
                  resolveTeamMemberAssets(m, savedMechs, allPilots, allRoms)
                );
                const tTon = computeTeamTonnage(memAssets.map((r) => r.mech));
                const ok = tTon <= DEFAULT_TEAM_TONNAGE_CAP;
                return (
                  <div
                    key={team.id}
                    className={`cm-team-saved-card ${editingTeamId === team.id ? 'is-selected' : ''}`}
                  >
                    <div className="cm-team-saved-head">
                      <strong>{team.name}</strong>
                      <span className={`cm-bf-team-badge ${ok ? 'is-ok' : 'is-over'}`}>
                        {tTon}/{DEFAULT_TEAM_TONNAGE_CAP}t
                      </span>
                    </div>
                    <div className="cm-team-saved-members">
                      {memAssets.map((a, i) => (
                        <span key={`${team.id}_${i}`}>
                          {i + 1}. {a.mech.name} ({getMechChassisTonnage(a.mech)}t)
                        </span>
                      ))}
                    </div>
                    <div className="cm-btn-group">
                      <button
                        type="button"
                        className="cm-btn-xs"
                        onClick={() => handleLoadTeamForEdit(team)}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className="cm-btn-xs"
                        onClick={() =>
                          onTestTeamInStudio(
                            team.name,
                            memAssets.map((r) => ({
                              mech: r.mech,
                              pilot: r.pilot,
                              mechEntryId: r.mechEntryId,
                            }))
                          )
                        }
                      >
                        試運転
                      </button>
                      <button
                        type="button"
                        className="cm-btn-primary-xs"
                        disabled={!ok}
                        onClick={() => onRegisterToBattlefield(team)}
                      >
                        BF登録
                      </button>
                      <button
                        type="button"
                        className="cm-icon-btn cm-icon-btn--danger"
                        title="チーム削除"
                        onClick={() => {
                          onDeleteTeam(team.id);
                          if (editingTeamId === team.id) setEditingTeamId(undefined);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
