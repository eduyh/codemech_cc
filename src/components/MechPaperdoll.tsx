import { CSSProperties, KeyboardEvent, useId } from 'react';
import { clamp } from '../engine/math';
import {
  DualArmorPartId,
  DualArmorPartRuntimeState,
  MechArmorAllocation,
  MechChassisSpec,
  MechPartId,
  MechRuntimeState,
  SingleArmorPartRuntimeState,
} from '../types/mech';

type MechPaperdollProps =
  | {
      mode: 'garage';
      chassis: MechChassisSpec;
      armor: MechArmorAllocation;
      selectedPart: MechPartId;
      pairedPart?: MechPartId;
      onSelectPart: (part: MechPartId) => void;
      className?: string;
    }
  | {
      mode: 'battle';
      parts: MechRuntimeState['parts'];
      className?: string;
    };

interface PlateVisual {
  fill: string;
  stroke: string;
  text: string;
  dashed?: boolean;
}

const SVG_TEXT_STYLE: CSSProperties = {
  paintOrder: 'stroke',
  stroke: 'rgba(2, 6, 23, 0.84)',
  strokeWidth: 2.6,
  strokeLinejoin: 'round',
  pointerEvents: 'none',
};

function getPlateStyle(ratio: number, destroyed: boolean, mode: 'garage' | 'battle'): PlateVisual {
  if (destroyed) {
    return {
      fill: '#1e293b',
      stroke: '#ef4444',
      text: '#fca5a5',
      dashed: true,
    };
  }
  if (ratio <= 0.001) {
    return {
      fill: mode === 'battle' ? '#7f1d1d' : '#1e293b',
      stroke: mode === 'battle' ? '#f87171' : '#475569',
      text: mode === 'battle' ? '#fecaca' : '#94a3b8',
    };
  }
  if (ratio >= 0.75) {
    return { fill: '#15803d', stroke: '#4ade80', text: '#ffffff' };
  }
  if (ratio >= 0.45) {
    return { fill: '#0369a1', stroke: '#38bdf8', text: '#ffffff' };
  }
  if (mode === 'battle' && ratio < 0.25) {
    return { fill: '#991b1b', stroke: '#f87171', text: '#ffffff' };
  }
  return { fill: '#b45309', stroke: '#fbbf24', text: '#ffffff' };
}

function getBattleDualFrontRatio(p: DualArmorPartRuntimeState): number {
  if (p.maxFrontArmor > 0) {
    return p.frontArmor > 0 ? p.frontArmor / p.maxFrontArmor : 0;
  }
  return p.maxStructure > 0 ? p.structure / p.maxStructure : 0;
}

function getBattleDualRearRatio(p: DualArmorPartRuntimeState): number {
  if (p.maxRearArmor > 0) {
    return p.rearArmor > 0 ? p.rearArmor / p.maxRearArmor : 0;
  }
  return p.maxStructure > 0 ? p.structure / p.maxStructure : 0;
}

function getBattleSingleRatio(p: SingleArmorPartRuntimeState): number {
  if (p.maxArmor > 0) {
    return p.armor > 0 ? p.armor / p.maxArmor : 0;
  }
  return p.maxStructure > 0 ? p.structure / p.maxStructure : 0;
}

function getGarageDualFrontRatio(front: number, cap: number): number {
  if (front <= 0) return 0;
  return clamp(front / Math.max(1, cap * 0.75), 0, 1);
}

function getGarageDualRearRatio(rear: number, cap: number): number {
  if (rear <= 0) return 0;
  return clamp(rear / Math.max(1, cap * 0.25), 0, 1);
}

export function MechPaperdoll(props: MechPaperdollProps) {
  const uid = useId().replace(/:/g, '');
  const glowId = `cm-doll-glow-${uid}`;
  const isGarage = props.mode === 'garage';

  const getDualData = (
    partId: DualArmorPartId,
    frontKey: keyof MechArmorAllocation,
    rearKey: keyof MechArmorAllocation
  ) => {
    if (props.mode === 'garage') {
      const front = props.armor[frontKey];
      const rear = props.armor[rearKey];
      const cap = props.chassis.maxTorsoArmorTotals[partId];
      return {
        destroyed: false,
        frontStyle: getPlateStyle(getGarageDualFrontRatio(front, cap), false, 'garage'),
        rearStyle: getPlateStyle(getGarageDualRearRatio(rear, cap), false, 'garage'),
        frontMain: `前 ${front}`,
        frontSub: `/${cap}`,
        rearMain: `後 ${rear}`,
      };
    }
    const p = props.parts[partId];
    return {
      destroyed: p.destroyed,
      frontStyle: getPlateStyle(getBattleDualFrontRatio(p), p.destroyed, 'battle'),
      rearStyle: getPlateStyle(getBattleDualRearRatio(p), p.destroyed, 'battle'),
      frontMain: '',
      frontSub: '',
      rearMain: '',
    };
  };

  const getSingleData = (
    partId: 'head' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'
  ) => {
    if (props.mode === 'garage') {
      const val = props.armor[partId];
      const max = props.chassis.maxArmor[partId];
      const ratio = max > 0 ? val / max : 0;
      return {
        destroyed: false,
        style: getPlateStyle(ratio, false, 'garage'),
        main: `${val}`,
        sub: `/${max}`,
      };
    }
    const p = props.parts[partId];
    return {
      destroyed: p.destroyed,
      style: getPlateStyle(getBattleSingleRatio(p), p.destroyed, 'battle'),
      main: '',
      sub: '',
    };
  };

  const head = getSingleData('head');
  const ct = getDualData('torso', 'torsoFront', 'torsoRear');
  const rt = getDualData('rightShoulder', 'rightShoulderFront', 'rightShoulderRear');
  const lt = getDualData('leftShoulder', 'leftShoulderFront', 'leftShoulderRear');
  const rArm = getSingleData('rightArm');
  const lArm = getSingleData('leftArm');
  const rLeg = getSingleData('rightLeg');
  const lLeg = getSingleData('leftLeg');

  const partHighlight = (partId: MechPartId) => {
    if (!isGarage) return null;
    const isSel = props.selectedPart === partId;
    const isPair = props.pairedPart === partId;
    if (isSel) {
      return {
        stroke: '#facc15',
        strokeWidth: 3,
        filter: `url(#${glowId})`,
        dash: undefined as string | undefined,
      };
    }
    if (isPair) {
      return {
        stroke: '#38bdf8',
        strokeWidth: 2.3,
        filter: undefined as string | undefined,
        dash: '5 3',
      };
    }
    return null;
  };

  const interactiveProps = (partId: MechPartId) => {
    if (!isGarage) return {};
    return {
      className: 'cm-doll-part',
      role: 'button' as const,
      tabIndex: 0,
      'aria-pressed': props.selectedPart === partId,
      onClick: () => props.onSelectPart(partId),
      onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onSelectPart(partId);
        }
      },
    };
  };

  const renderHighlight = (partId: MechPartId, plateStyle: PlateVisual) => {
    const hi = partHighlight(partId);
    return {
      stroke: hi ? hi.stroke : plateStyle.stroke,
      strokeWidth: hi ? hi.strokeWidth : 1.7,
      strokeDasharray: hi ? hi.dash : plateStyle.dashed ? '4 2' : undefined,
      filter: hi?.filter,
    };
  };

  return (
    <svg
      className={props.className ?? (isGarage ? 'cm-garage-doll' : 'cm-silhouette-svg')}
      viewBox={isGarage ? '0 0 280 264' : '2 16 276 244'}
      aria-label={
        isGarage
          ? 'BattleMech 8部位ペーパードール（クリックして装甲部位を選択）'
          : 'BattleMech 8部位 装甲・構造シルエット'
      }
    >
      {isGarage && (
        <defs>
          <filter id={glowId} x="-18%" y="-18%" width="136%" height="136%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.4" floodColor="#facc15" floodOpacity="0.72" />
          </filter>
        </defs>
      )}

      {/* Orientation Cues (Garage only) */}
      {isGarage && (
        <>
          <text x="10" y="13" fontSize="9.5" fill="#94a3b8" fontWeight="700">
            ← 右側 (R)
          </text>
          <text x="140" y="13" textAnchor="middle" fontSize="9.5" fill="#7dd3fc" fontWeight="800">
            正面視
          </text>
          <text x="270" y="13" textAnchor="end" fontSize="9.5" fill="#94a3b8" fontWeight="700">
            左側 (L) →
          </text>
        </>
      )}

      {/* Center Torso */}
      <g {...interactiveProps('torso')} filter={partHighlight('torso')?.filter}>
        <polygon
          points="116,56 164,56 168,62 168,118 112,118 112,62"
          fill={ct.frontStyle.fill}
          {...renderHighlight('torso', ct.frontStyle)}
          filter={undefined}
        />
        <rect
          x="112"
          y="120"
          width="56"
          height="28"
          rx="3"
          fill={ct.rearStyle.fill}
          {...renderHighlight('torso', ct.rearStyle)}
          filter={undefined}
        />
        {isGarage ? (
          <>
            <text x="140" y="74" textAnchor="middle" fontSize="10.5" fill={ct.frontStyle.text} style={SVG_TEXT_STYLE}>
              中胴
            </text>
            <text x="140" y="95" textAnchor="middle" fontSize="13.5" fill={ct.frontStyle.text} style={SVG_TEXT_STYLE}>
              {ct.frontMain}
            </text>
            {ct.frontSub && (
              <text x="140" y="110" textAnchor="middle" fontSize="9.5" fill="#cbd5e1" style={SVG_TEXT_STYLE}>
                {ct.frontSub}
              </text>
            )}
            <text x="140" y="138" textAnchor="middle" fontSize="11.5" fill={ct.rearStyle.text} style={SVG_TEXT_STYLE}>
              {ct.rearMain}
            </text>
          </>
        ) : (
          <>
            <text x="140" y="92" textAnchor="middle" fontSize="14" fill={ct.frontStyle.text} style={SVG_TEXT_STYLE}>
              {ct.destroyed ? '✕' : '中胴'}
            </text>
            <text x="140" y="138" textAnchor="middle" fontSize="13" fill={ct.rearStyle.text} style={SVG_TEXT_STYLE}>
              {ct.destroyed ? '✕' : '後'}
            </text>
          </>
        )}
      </g>

      {/* Head */}
      <g {...interactiveProps('head')} filter={partHighlight('head')?.filter}>
        <polygon
          points="118,20 162,20 172,30 172,48 164,52 116,52 108,48 108,30"
          fill={head.style.fill}
          {...renderHighlight('head', head.style)}
          filter={undefined}
        />
        <rect x="122" y="24" width="36" height="4" rx="1.5" fill="#020617" opacity="0.55" pointerEvents="none" />
        {isGarage ? (
          <text x="140" y="42" textAnchor="middle" fontSize="11" fill={head.style.text} style={SVG_TEXT_STYLE}>
            頭 {head.main}
            {head.sub}
          </text>
        ) : (
          <text x="140" y="42" textAnchor="middle" fontSize="14" fill={head.style.text} style={SVG_TEXT_STYLE}>
            {head.destroyed ? '✕' : '頭'}
          </text>
        )}
      </g>

      {/* Right Torso (viewer-left) */}
      <g {...interactiveProps('rightShoulder')} filter={partHighlight('rightShoulder')?.filter}>
        <polygon
          points="66,58 108,58 108,118 58,118 58,68"
          fill={rt.frontStyle.fill}
          {...renderHighlight('rightShoulder', rt.frontStyle)}
          filter={undefined}
        />
        <rect
          x="58"
          y="120"
          width="50"
          height="26"
          rx="3"
          fill={rt.rearStyle.fill}
          {...renderHighlight('rightShoulder', rt.rearStyle)}
          filter={undefined}
        />
        {isGarage ? (
          <>
            <text x="83" y="76" textAnchor="middle" fontSize="10.5" fill={rt.frontStyle.text} style={SVG_TEXT_STYLE}>
              右胴
            </text>
            <text x="83" y="96" textAnchor="middle" fontSize="13" fill={rt.frontStyle.text} style={SVG_TEXT_STYLE}>
              {rt.frontMain}
            </text>
            {rt.frontSub && (
              <text x="83" y="110" textAnchor="middle" fontSize="9.5" fill="#cbd5e1" style={SVG_TEXT_STYLE}>
                {rt.frontSub}
              </text>
            )}
            <text x="83" y="137" textAnchor="middle" fontSize="11" fill={rt.rearStyle.text} style={SVG_TEXT_STYLE}>
              {rt.rearMain}
            </text>
          </>
        ) : (
          <>
            <text x="83" y="92" textAnchor="middle" fontSize="14" fill={rt.frontStyle.text} style={SVG_TEXT_STYLE}>
              {rt.destroyed ? '✕' : '右胴'}
            </text>
            {rt.destroyed && (
              <text x="83" y="137" textAnchor="middle" fontSize="12" fill={rt.rearStyle.text} style={SVG_TEXT_STYLE}>
                ✕
              </text>
            )}
          </>
        )}
      </g>

      {/* Left Torso (viewer-right) */}
      <g {...interactiveProps('leftShoulder')} filter={partHighlight('leftShoulder')?.filter}>
        <polygon
          points="172,58 214,58 222,68 222,118 172,118"
          fill={lt.frontStyle.fill}
          {...renderHighlight('leftShoulder', lt.frontStyle)}
          filter={undefined}
        />
        <rect
          x="172"
          y="120"
          width="50"
          height="26"
          rx="3"
          fill={lt.rearStyle.fill}
          {...renderHighlight('leftShoulder', lt.rearStyle)}
          filter={undefined}
        />
        {isGarage ? (
          <>
            <text x="197" y="76" textAnchor="middle" fontSize="10.5" fill={lt.frontStyle.text} style={SVG_TEXT_STYLE}>
              左胴
            </text>
            <text x="197" y="96" textAnchor="middle" fontSize="13" fill={lt.frontStyle.text} style={SVG_TEXT_STYLE}>
              {lt.frontMain}
            </text>
            {lt.frontSub && (
              <text x="197" y="110" textAnchor="middle" fontSize="9.5" fill="#cbd5e1" style={SVG_TEXT_STYLE}>
                {lt.frontSub}
              </text>
            )}
            <text x="197" y="137" textAnchor="middle" fontSize="11" fill={lt.rearStyle.text} style={SVG_TEXT_STYLE}>
              {lt.rearMain}
            </text>
          </>
        ) : (
          <>
            <text x="197" y="92" textAnchor="middle" fontSize="14" fill={lt.frontStyle.text} style={SVG_TEXT_STYLE}>
              {lt.destroyed ? '✕' : '左胴'}
            </text>
            {lt.destroyed && (
              <text x="197" y="137" textAnchor="middle" fontSize="12" fill={lt.rearStyle.text} style={SVG_TEXT_STYLE}>
                ✕
              </text>
            )}
          </>
        )}
      </g>

      {/* Right Arm (viewer-left) */}
      <g {...interactiveProps('rightArm')} filter={partHighlight('rightArm')?.filter}>
        <rect x="52" y="76" width="6" height="18" fill="#334155" stroke="#0f172a" strokeWidth="1" />
        <polygon
          points="16,66 52,66 52,150 42,158 14,158 8,144 8,76"
          fill={rArm.style.fill}
          {...renderHighlight('rightArm', rArm.style)}
          filter={undefined}
        />
        {isGarage ? (
          <>
            <text x="30" y="96" textAnchor="middle" fontSize="10.5" fill={rArm.style.text} style={SVG_TEXT_STYLE}>
              右腕
            </text>
            <text x="30" y="119" textAnchor="middle" fontSize="14.5" fill={rArm.style.text} style={SVG_TEXT_STYLE}>
              {rArm.main}
            </text>
            {rArm.sub && (
              <text x="30" y="135" textAnchor="middle" fontSize="9.5" fill="#cbd5e1" style={SVG_TEXT_STYLE}>
                {rArm.sub}
              </text>
            )}
          </>
        ) : (
          <text x="30" y="117" textAnchor="middle" fontSize="14" fill={rArm.style.text} style={SVG_TEXT_STYLE}>
            {rArm.destroyed ? '✕' : '右'}
          </text>
        )}
      </g>

      {/* Left Arm (viewer-right) */}
      <g {...interactiveProps('leftArm')} filter={partHighlight('leftArm')?.filter}>
        <rect x="222" y="76" width="6" height="18" fill="#334155" stroke="#0f172a" strokeWidth="1" />
        <polygon
          points="228,66 264,66 272,76 272,144 266,158 238,158 228,150"
          fill={lArm.style.fill}
          {...renderHighlight('leftArm', lArm.style)}
          filter={undefined}
        />
        {isGarage ? (
          <>
            <text x="250" y="96" textAnchor="middle" fontSize="10.5" fill={lArm.style.text} style={SVG_TEXT_STYLE}>
              左腕
            </text>
            <text x="250" y="119" textAnchor="middle" fontSize="14.5" fill={lArm.style.text} style={SVG_TEXT_STYLE}>
              {lArm.main}
            </text>
            {lArm.sub && (
              <text x="250" y="135" textAnchor="middle" fontSize="9.5" fill="#cbd5e1" style={SVG_TEXT_STYLE}>
                {lArm.sub}
              </text>
            )}
          </>
        ) : (
          <text x="250" y="117" textAnchor="middle" fontSize="14" fill={lArm.style.text} style={SVG_TEXT_STYLE}>
            {lArm.destroyed ? '✕' : '左'}
          </text>
        )}
      </g>

      {/* Pelvis / Hip Actuator */}
      <polygon
        points="96,152 184,152 176,166 104,166"
        fill="#1e293b"
        stroke="#475569"
        strokeWidth="1.5"
      />

      {/* Right Leg (viewer-left) */}
      <g {...interactiveProps('rightLeg')} filter={partHighlight('rightLeg')?.filter}>
        <polygon
          points="88,170 130,170 132,208 126,244 132,256 76,256 80,242 84,208"
          fill={rLeg.style.fill}
          {...renderHighlight('rightLeg', rLeg.style)}
          filter={undefined}
        />
        <line x1="85" y1="208" x2="131" y2="208" stroke="#020617" strokeOpacity="0.45" strokeWidth="1.5" pointerEvents="none" />
        {isGarage ? (
          <>
            <text x="108" y="195" textAnchor="middle" fontSize="10.5" fill={rLeg.style.text} style={SVG_TEXT_STYLE}>
              右脚
            </text>
            <text x="106" y="228" textAnchor="middle" fontSize="14.5" fill={rLeg.style.text} style={SVG_TEXT_STYLE}>
              {rLeg.main}
            </text>
            {rLeg.sub && (
              <text x="106" y="243" textAnchor="middle" fontSize="9.5" fill="#cbd5e1" style={SVG_TEXT_STYLE}>
                {rLeg.sub}
              </text>
            )}
          </>
        ) : (
          <text x="106" y="220" textAnchor="middle" fontSize="14" fill={rLeg.style.text} style={SVG_TEXT_STYLE}>
            {rLeg.destroyed ? '✕' : '右脚'}
          </text>
        )}
      </g>

      {/* Left Leg (viewer-right) */}
      <g {...interactiveProps('leftLeg')} filter={partHighlight('leftLeg')?.filter}>
        <polygon
          points="150,170 192,170 196,208 200,242 204,256 148,256 154,244 148,208"
          fill={lLeg.style.fill}
          {...renderHighlight('leftLeg', lLeg.style)}
          filter={undefined}
        />
        <line x1="149" y1="208" x2="195" y2="208" stroke="#020617" strokeOpacity="0.45" strokeWidth="1.5" pointerEvents="none" />
        {isGarage ? (
          <>
            <text x="172" y="195" textAnchor="middle" fontSize="10.5" fill={lLeg.style.text} style={SVG_TEXT_STYLE}>
              左脚
            </text>
            <text x="174" y="228" textAnchor="middle" fontSize="14.5" fill={lLeg.style.text} style={SVG_TEXT_STYLE}>
              {lLeg.main}
            </text>
            {lLeg.sub && (
              <text x="174" y="243" textAnchor="middle" fontSize="9.5" fill="#cbd5e1" style={SVG_TEXT_STYLE}>
                {lLeg.sub}
              </text>
            )}
          </>
        ) : (
          <text x="174" y="220" textAnchor="middle" fontSize="14" fill={lLeg.style.text} style={SVG_TEXT_STYLE}>
            {lLeg.destroyed ? '✕' : '左脚'}
          </text>
        )}
      </g>
    </svg>
  );
}
