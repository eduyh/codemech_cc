import {
  GridDir,
  MechBlueprint,
  MechSubroutine,
  MechSubroutineCell,
  PilotGridCell,
  PilotProfile,
} from '../types/mech';

function nextPos(row: number, col: number, dir: GridDir): { row: number; col: number } {
  switch (dir) {
    case 'N':
      return { row: row - 1, col };
    case 'E':
      return { row, col: col + 1 };
    case 'S':
      return { row: row + 1, col };
    case 'W':
      return { row, col: col - 1 };
  }
}

function pilotCondExpr(cell: PilotGridCell): string {
  switch (cell.op) {
    case 'if_enemy_in_sight':
      return 'vision.has_enemy()';
    case 'if_enemy_on_radar':
      return 'radar.detected()';
    case 'if_enemy_dist_lt':
      return `target.distance < ${Math.round(cell.param ?? 150)}`;
    case 'if_enemy_dist_gt':
      return `target.distance > ${Math.round(cell.param ?? 180)}`;
    case 'if_enemy_flank':
      return `radar.flank_distance < ${Math.round(cell.param ?? 160)}`;
    case 'if_heat_above':
      return `mech.heat_pct > ${Math.round(cell.param ?? 85)}`;
    case 'if_heat_below':
      return `mech.heat_pct < ${Math.round(cell.param ?? 45)}`;
    case 'if_ammo_empty':
      return cell.weaponSlot ? `mech.ammo_empty("${cell.weaponSlot}")` : 'mech.any_ammo_empty()';
    case 'if_part_destroyed':
      return cell.partId ? `mech.part_broken("${cell.partId}")` : 'mech.any_part_broken()';
    case 'if_torso_hp_below':
      return `mech.torso_hp_pct < ${Math.round(cell.param ?? 50)}`;
    case 'if_incoming_fire':
      return 'sensor.incoming_fire()';
    case 'if_target_locked':
      return 'sensor.target_locked()';
    case 'if_incoming_missile':
      return 'sensor.incoming_missile()';
    case 'if_ecm_jammed':
      return 'sensor.ecm_jammed()';
    case 'if_enemy_hp_below':
      return `target.hp_pct < ${Math.round(cell.param ?? 35)}`;
    case 'if_flag_a':
      return 'flag_a';
    case 'if_flag_b':
      return 'flag_b';
    default:
      return 'False';
  }
}

function pilotStmt(cell: PilotGridCell): string {
  const tgt = cell.target ?? 'main';
  const dur = Number((cell.durationSec ?? 0.65).toFixed(2));
  switch (cell.op) {
    case 'call_s1':
    case 'call_s2':
    case 'call_s3':
    case 'call_s4':
    case 'call_s5':
      return `sub_${cell.op.slice(-2)}(target="${tgt}", max_sec=${dur})`;
    case 'emergency_cool':
      return `emergency_cool(${dur})`;
    case 'override_on':
      return 'override_shutdown = True';
    case 'override_off':
      return 'override_shutdown = False';
    case 'flag_a_on':
      return 'flag_a = True';
    case 'flag_a_off':
      return 'flag_a = False';
    case 'flag_b_on':
      return 'flag_b = True';
    case 'flag_b_off':
      return 'flag_b = False';
    default:
      return `${cell.op}()`;
  }
}

function subCondExpr(cell: MechSubroutineCell): string {
  switch (cell.op) {
    case 'if_group_1_ready':
      return 'weapons.group("G1").ready()';
    case 'if_group_2_ready':
      return 'weapons.group("G2").ready()';
    case 'if_group_3_ready':
      return 'weapons.group("G3").ready()';
    case 'if_group_4_ready':
      return 'weapons.group("G4").ready()';
    case 'if_right_arm_ready':
      return 'weapons.right_arm.ready()';
    case 'if_left_arm_ready':
      return 'weapons.left_arm.ready()';
    case 'if_right_shoulder_ready':
      return 'weapons.right_shoulder.ready()';
    case 'if_left_shoulder_ready':
      return 'weapons.left_shoulder.ready()';
    case 'if_enemy_in_sight':
      return 'vision.has_enemy()';
    case 'if_enemy_dist_lt':
      return `target.distance < ${Math.round(cell.param ?? 150)}`;
    case 'if_enemy_dist_gt':
      return `target.distance > ${Math.round(cell.param ?? 180)}`;
    case 'if_heat_above':
      return `mech.heat_pct > ${Math.round(cell.param ?? 80)}`;
    case 'if_heat_below':
      return `mech.heat_pct < ${Math.round(cell.param ?? 50)}`;
    case 'if_right_armor_weaker':
      return 'mech.right_armor < mech.left_armor';
    case 'if_ammo_empty':
      return cell.weaponSlot ? `mech.ammo_empty("${cell.weaponSlot}")` : 'mech.any_ammo_empty()';
    case 'if_airborne':
      return 'mech.is_airborne()';
    case 'if_incoming_fire':
      return 'sensor.incoming_fire()';
    case 'if_target_locked':
      return 'sensor.target_locked()';
    case 'if_incoming_missile':
      return 'sensor.incoming_missile()';
    case 'if_ecm_jammed':
      return 'sensor.ecm_jammed()';
    default:
      return 'False';
  }
}

function subStmt(cell: MechSubroutineCell): string {
  const dur = Number((cell.durationSec ?? 0.4).toFixed(2));
  switch (cell.op) {
    case 'wait':
      return `wait(${dur})`;
    case 'return':
      return 'return';
    case 'move_approach':
      return 'legs.approach(target)';
    case 'move_maintain':
      return `legs.maintain_range(${Math.round(cell.param ?? 165)})`;
    case 'move_circle':
      return `legs.circle_orbit(${Math.round(cell.param ?? 135)}, dir="${cell.direction ?? 'auto'}")`;
    case 'move_evade':
      return `legs.evasive_weave(dir="${cell.direction ?? 'auto'}")`;
    case 'move_retreat':
      return 'legs.reverse_retreat()';
    case 'move_high_ground':
      return 'legs.seek_high_ground()';
    case 'move_jump':
      return 'legs.jump_jet_60deg()';
    case 'move_stop':
      return 'legs.halt()';
    case 'torso_track':
      return 'torso.track(target)';
    case 'torso_twist_auto':
      return 'torso.defend_healthy_side()';
    case 'torso_twist_angle': {
      const deg = Math.round(cell.param ?? 60);
      return `torso.twist(${deg >= 0 ? `+${deg}` : deg})`;
    }
    case 'torso_twist_r':
      return 'torso.twist(+60)';
    case 'torso_twist_l':
      return 'torso.twist(-60)';
    case 'torso_center':
      return 'torso.center()';
    case 'fire_group_1':
      return `fire_group("G1", max_wait=${dur})`;
    case 'fire_group_2':
      return `fire_group("G2", max_wait=${dur})`;
    case 'fire_group_3':
      return `fire_group("G3", max_wait=${dur})`;
    case 'fire_group_4':
      return `fire_group("G4", max_wait=${dur})`;
    case 'fire_right_arm':
      return `fire("rightArm", max_wait=${dur})`;
    case 'fire_left_arm':
      return `fire("leftArm", max_wait=${dur})`;
    case 'fire_right_shoulder':
      return `fire("rightShoulder", max_wait=${dur})`;
    case 'fire_left_shoulder':
      return `fire("leftShoulder", max_wait=${dur})`;
    case 'fire_alpha':
      return `fire_all(max_wait=${dur})`;
    case 'emergency_cool':
      return `emergency_cool(${dur})`;
    case 'override_on':
      return 'override_shutdown = True';
    case 'override_off':
      return 'override_shutdown = False';
    default:
      return `${cell.op}()`;
  }
}

export function formatPilotCellPython(cell: PilotGridCell): string {
  if (cell.op === 'start') return 'def main():  # パイロット開始点';
  if (cell.op === 'wire') return 'pass  # 配線（次のマスへ通過）';
  if (cell.op.startsWith('if_')) return `if ${pilotCondExpr(cell)}:`;
  return pilotStmt(cell);
}

export function formatSubCellPython(cell: MechSubroutineCell): string {
  if (cell.op === 'start') return 'def subroutine():  # 機体枠開始点';
  if (cell.op === 'wire') return 'pass  # 配線（次のマスへ通過）';
  if (cell.op.startsWith('if_')) return `if ${subCondExpr(cell)}:`;
  return subStmt(cell);
}

export function pilotGridToPython(profile: PilotProfile): string {
  const grid = profile.grid;
  const lines: string[] = [
    `# Pilot 6x6 Main Flowchart: ${profile.name}`,
    'def main(mech, vision, radar):',
  ];

  const emitNode = (
    row: number,
    col: number,
    indent: string,
    visited: Set<string>
  ): void => {
    if (row < 0 || row >= grid.gridSize || col < 0 || col >= grid.gridSize) {
      lines.push(`${indent}# ↺ 先頭へ戻る`);
      return;
    }
    const key = `${row},${col}`;
    if (visited.has(key)) {
      lines.push(`${indent}# ↺ (${row + 1},${col + 1}) へループ`);
      return;
    }
    const cell = grid.cells.find((c) => c.row === row && c.col === col);
    if (!cell || cell.op === 'empty') {
      lines.push(`${indent}# ↺ 先頭へ戻る`);
      return;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(key);

    if (cell.op === 'start' || cell.op === 'wire') {
      const n = nextPos(row, col, cell.dir);
      emitNode(n.row, n.col, indent, nextVisited);
      return;
    }

    if (cell.op.startsWith('if_')) {
      const t = nextPos(row, col, cell.dir);
      const f = nextPos(row, col, cell.elseDir ?? cell.dir);
      lines.push(`${indent}if ${pilotCondExpr(cell)}:`);
      emitNode(t.row, t.col, `${indent}    `, nextVisited);
      lines.push(`${indent}else:`);
      emitNode(f.row, f.col, `${indent}    `, nextVisited);
      return;
    }

    lines.push(`${indent}${pilotStmt(cell)}`);
    const n = nextPos(row, col, cell.dir);
    emitNode(n.row, n.col, indent, nextVisited);
  };

  const start = grid.cells.find((c) => c.op === 'start') ?? {
    row: 0,
    col: 0,
    op: 'start' as const,
    dir: 'E' as const,
  };
  emitNode(start.row, start.col, '    ', new Set());
  if (lines.length === 2) {
    lines.push('    pass');
  }
  return lines.join('\n');
}

export function subroutineToPython(sub: MechSubroutine): string {
  const lines: string[] = [
    `# ${sub.slotId} (${sub.gridSize}x${sub.gridSize}): ${sub.name}`,
    `def sub_${sub.slotId.toLowerCase()}(target):`,
  ];

  const emitNode = (
    row: number,
    col: number,
    indent: string,
    visited: Set<string>
  ): void => {
    if (row < 0 || row >= sub.gridSize || col < 0 || col >= sub.gridSize) {
      lines.push(`${indent}return`);
      return;
    }
    const key = `${row},${col}`;
    if (visited.has(key)) {
      lines.push(`${indent}# ↺ (${row + 1},${col + 1}) へループ`);
      return;
    }
    const cell = sub.cells.find((c) => c.row === row && c.col === col);
    if (!cell || cell.op === 'empty') {
      lines.push(`${indent}return`);
      return;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(key);

    if (cell.op === 'start' || cell.op === 'wire') {
      const n = nextPos(row, col, cell.dir);
      emitNode(n.row, n.col, indent, nextVisited);
      return;
    }

    if (cell.op === 'return') {
      lines.push(`${indent}return`);
      return;
    }

    if (cell.op.startsWith('if_')) {
      const t = nextPos(row, col, cell.dir);
      const f = nextPos(row, col, cell.elseDir ?? cell.dir);
      lines.push(`${indent}if ${subCondExpr(cell)}:`);
      emitNode(t.row, t.col, `${indent}    `, nextVisited);
      lines.push(`${indent}else:`);
      emitNode(f.row, f.col, `${indent}    `, nextVisited);
      return;
    }

    lines.push(`${indent}${subStmt(cell)}`);
    const n = nextPos(row, col, cell.dir);
    emitNode(n.row, n.col, indent, nextVisited);
  };

  const start = sub.cells.find((c) => c.op === 'start') ?? {
    row: 0,
    col: 0,
    op: 'start' as const,
    dir: 'E' as const,
  };
  emitNode(start.row, start.col, '    ', new Set());
  if (lines.length === 2) {
    lines.push('    return');
  }
  return lines.join('\n');
}

export function fullProgramToPython(profile: PilotProfile, mech: MechBlueprint): string {
  const parts = [pilotGridToPython(profile)];
  for (const sub of mech.subroutines) {
    parts.push(subroutineToPython(sub));
  }
  return parts.join('\n\n');
}
