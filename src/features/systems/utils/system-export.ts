import type {
  DefenseContext,
  DefensePosition,
  DefenseRotationSystem,
  DefenseSystemBlock,
  ReceptionPosition,
  ReceptionRotationSystem,
  ReceptionSystemBlock,
} from '@src/domain/systems/types';
import { saveFile } from '../../../lib/utils/save-file';

type SystemExportKind = 'defense' | 'reception';
type ExportableSystemBlock = DefenseSystemBlock | ReceptionSystemBlock;

const DEFENSE_CONTEXT_ORDER: DefenseContext[] = ['break_point', 'side_out'];

function quote(value: string): string {
  return JSON.stringify(value);
}

function formatNumber(value: number): string {
  return String(Number.isFinite(value) ? Number(value.toFixed(4)) : 0);
}

function formatRole(role: DefensePosition['role'] | ReceptionPosition['role']): string {
  return `PlayerRole.${role}`;
}

function indent(level: number): string {
  return '  '.repeat(level);
}

function toSupportedIdentifier(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function toConstantName(systemName: string, kind: SystemExportKind): string {
  const suffix = kind === 'defense' ? 'DEFENSE_SYSTEM' : 'RECEPTION_SYSTEM';
  const baseName = toSupportedIdentifier(systemName) || 'CUSTOM';
  const safeBaseName = /^[0-9]/.test(baseName) ? `SYSTEM_${baseName}` : baseName;

  return `${safeBaseName}_${suffix}`;
}

function formatPosition(position: DefensePosition | ReceptionPosition, level: number): string {
  const spaces = indent(level);
  const innerSpaces = indent(level + 1);

  return [
    `${spaces}{`,
    `${innerSpaces}role: ${formatRole(position.role)},`,
    `${innerSpaces}dataVolleyZone: ${quote(position.dataVolleyZone)},`,
    `${innerSpaces}x: ${formatNumber(position.x)},`,
    `${innerSpaces}y: ${formatNumber(position.y)},`,
    `${spaces}}`,
  ].join('\n');
}

function formatPositions(
  positions: readonly (DefensePosition | ReceptionPosition)[],
  level: number,
): string {
  if (positions.length === 0) {
    return '[]';
  }

  return [
    '[',
    positions.map((position) => formatPosition(position, level + 1)).join(',\n'),
    `${indent(level)}]`,
  ].join('\n');
}

function formatDefenseRotation(rotation: DefenseRotationSystem, level: number): string {
  const spaces = indent(level);
  const innerSpaces = indent(level + 1);

  return [
    `${spaces}{`,
    `${innerSpaces}rotation: ${rotation.rotation},`,
    `${innerSpaces}positions: ${formatPositions(rotation.positions, level + 1)},`,
    `${spaces}}`,
  ].join('\n');
}

function formatReceptionRotation(rotation: ReceptionRotationSystem, level: number): string {
  const spaces = indent(level);
  const innerSpaces = indent(level + 1);

  return [
    `${spaces}{`,
    `${innerSpaces}rotation: ${rotation.rotation},`,
    `${innerSpaces}positions: ${formatPositions(rotation.positions, level + 1)},`,
    `${spaces}}`,
  ].join('\n');
}

function formatRoleSequence(block: ExportableSystemBlock, level: number): string {
  if (block.roleSequence.length === 0) {
    return '[]';
  }

  return [
    '[',
    block.roleSequence.map((role) => `${indent(level + 1)}${formatRole(role)},`).join('\n'),
    `${indent(level)}]`,
  ].join('\n');
}

function serializeDefenseBlock(block: DefenseSystemBlock, constantName: string): string {
  const lines = [
    "import { PlayerRole, type DefenseSystemBlock } from '@src/domain/systems/types';",
    '',
    `export const ${constantName}: DefenseSystemBlock = {`,
    `  id: ${quote(block.id)},`,
    `  name: ${quote(block.name)},`,
  ];

  if (block.teamId) {
    lines.push(`  teamId: ${quote(block.teamId)},`);
  }

  if (block.playingSystemId) {
    lines.push(`  playingSystemId: ${quote(block.playingSystemId)},`);
  }

  lines.push(`  roleSequence: ${formatRoleSequence(block, 1)},`);
  lines.push('  contexts: {');

  DEFENSE_CONTEXT_ORDER.forEach((context) => {
    const rotations = block.contexts[context] ?? [];

    lines.push(`    ${context}: [`);
    lines.push(rotations.map((rotation) => formatDefenseRotation(rotation, 3)).join(',\n'));
    lines.push('    ],');
  });

  lines.push('  },');
  lines.push('};');

  return `${lines.join('\n')}\n`;
}

function serializeReceptionBlock(block: ReceptionSystemBlock, constantName: string): string {
  const lines = [
    "import { PlayerRole, type ReceptionSystemBlock } from '@src/domain/systems/types';",
    '',
    `export const ${constantName}: ReceptionSystemBlock = {`,
    `  id: ${quote(block.id)},`,
    `  name: ${quote(block.name)},`,
  ];

  if (block.teamId) {
    lines.push(`  teamId: ${quote(block.teamId)},`);
  }

  if (block.playingSystemId) {
    lines.push(`  playingSystemId: ${quote(block.playingSystemId)},`);
  }

  lines.push(`  roleSequence: ${formatRoleSequence(block, 1)},`);
  lines.push('  rotations: [');
  lines.push(block.rotations.map((rotation) => formatReceptionRotation(rotation, 2)).join(',\n'));
  lines.push('  ],');
  lines.push('};');

  return `${lines.join('\n')}\n`;
}

export function serializeSystemBlockToTypeScript(
  block: DefenseSystemBlock,
  kind: 'defense',
): string;
export function serializeSystemBlockToTypeScript(
  block: ReceptionSystemBlock,
  kind: 'reception',
): string;
export function serializeSystemBlockToTypeScript(
  block: ExportableSystemBlock,
  kind: SystemExportKind,
): string {
  const constantName = toConstantName(block.name, kind);

  return kind === 'defense'
    ? serializeDefenseBlock(block as DefenseSystemBlock, constantName)
    : serializeReceptionBlock(block as ReceptionSystemBlock, constantName);
}

export function getSystemExportFileName(systemName: string, kind: SystemExportKind): string {
  return `${toConstantName(systemName, kind).toLowerCase().replace(/_/g, '-')}.ts`;
}

export async function downloadTextFile(fileName: string, text: string): Promise<void> {
  await saveFile(fileName, text, 'text/typescript;charset=utf-8');
}
