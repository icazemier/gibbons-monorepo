/**
 * Reads and validates the three files the import-map check depends on.
 *
 * These are hand-edited files, so "the JSON parsed" says nothing about the
 * shape being right. Every value is narrowed before it leaves this module,
 * which keeps the domain logic in `deno-import-map.ts` working with types it
 * can trust rather than with assertions about them.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseCatalog,
  type DependencyRanges,
  type ImportMap,
  type PackageManifest,
} from './deno-import-map.ts';

/**
 * A deno.json, keeping every field the tool does not understand so that
 * rewriting the import map never drops one.
 */
export interface DenoConfig {
  readonly [field: string]: unknown;
  readonly imports?: ImportMap;
}

export interface PackageFiles {
  readonly directory: string;
  readonly denoFile: string;
  readonly manifestFile: string;
  readonly manifest: PackageManifest;
  readonly config: DenoConfig;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringRecord = (value: unknown, origin: string): DependencyRanges => {
  if (!isRecord(value)) {
    throw new Error(`${origin} must be an object`);
  }

  const ranges: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      throw new Error(`${origin}: "${key}" must be a string`);
    }
    ranges[key] = entry;
  }
  return ranges;
};

const readJsonObject = async (
  file: string
): Promise<Record<string, unknown>> => {
  const parsed: unknown = JSON.parse(await readFile(file, 'utf-8'));
  if (!isRecord(parsed)) {
    throw new Error(`${file} must contain a JSON object`);
  }
  return parsed;
};

export const readManifest = async (file: string): Promise<PackageManifest> => {
  const parsed = await readJsonObject(file);
  if (typeof parsed.name !== 'string') {
    throw new Error(`${file}: "name" must be a string`);
  }

  return {
    name: parsed.name,
    dependencies:
      parsed.dependencies === undefined
        ? undefined
        : toStringRecord(parsed.dependencies, `${file}: dependencies`),
    peerDependencies:
      parsed.peerDependencies === undefined
        ? undefined
        : toStringRecord(parsed.peerDependencies, `${file}: peerDependencies`),
    optionalDependencies:
      parsed.optionalDependencies === undefined
        ? undefined
        : toStringRecord(
            parsed.optionalDependencies,
            `${file}: optionalDependencies`
          ),
  };
};

export const readDenoConfig = async (file: string): Promise<DenoConfig> => {
  const parsed = await readJsonObject(file);
  if (parsed.imports === undefined) return parsed;

  return {
    ...parsed,
    imports: toStringRecord(parsed.imports, `${file}: imports`),
  };
};

export const readCatalog = async (
  workspaceFile: string
): Promise<ReadonlyMap<string, string>> =>
  parseCatalog(await readFile(workspaceFile, 'utf-8'));

export const readPackageFiles = async (
  directory: string
): Promise<PackageFiles> => {
  const denoFile = join(directory, 'deno.json');
  const manifestFile = join(directory, 'package.json');
  const [manifest, config] = await Promise.all([
    readManifest(manifestFile),
    readDenoConfig(denoFile),
  ]);

  return { directory, denoFile, manifestFile, manifest, config };
};
