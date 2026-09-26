/**
 * Headless BpmnModeler construction.
 *
 * Wraps `createHeadlessCanvas` with the moddle extensions needed to import
 * real-world BPMN files (Camunda 7 / Operaton extension attributes are
 * common even in diagrams that don't otherwise use Camunda features).
 */

import camundaModdle from 'camunda-bpmn-moddle/resources/camunda.json';
import { createHeadlessCanvas, getBpmnModeler } from './headless-canvas';
import RobotModule from './robot';

/** Moddle extensions registered on every modeler instance by default. */
const DEFAULT_MODDLE_EXTENSIONS = { camunda: camundaModdle };

export interface CreateModelerOptions {
  /** Additional/overriding moddle extensions, merged with the Camunda defaults. */
  moddleExtensions?: Record<string, unknown>;
  /** Additional modules to register with BpmnModeler. */
  additionalModules?: unknown[];
  /**
   * Register the Robot Framework task renderer (draws a robot icon, instead
   * of the default service-task icon, on tasks whose id contains "robot").
   * Default: true. Set to false for plain bpmn-js rendering, e.g. when a
   * caller compares output against fixtures/snapshots that don't expect it.
   */
  robot?: boolean;
  /**
   * Called with the BPMN import warnings instead of logging them to stderr
   * via `console.error` — lets a caller surface them through its own
   * logging/reporting instead.
   */
  onWarning?: (warnings: unknown[]) => void;
}

/**
 * Create a BpmnModeler on the shared headless canvas, without importing any
 * diagram into it. Useful for callers that manage their own import/blank
 * diagram lifecycle instead of using `createModelerFromXml`.
 */
export function createModeler(options: CreateModelerOptions = {}): any {
  const container = createHeadlessCanvas();
  const BpmnModeler = getBpmnModeler();
  const moddleExtensions = { ...DEFAULT_MODDLE_EXTENSIONS, ...options.moddleExtensions };
  const additionalModules = [
    ...(options.robot === false ? [] : [RobotModule]),
    ...(options.additionalModules ?? []),
  ];
  return new BpmnModeler({ container, additionalModules, moddleExtensions });
}

/** Create a BpmnModeler and import the supplied BPMN 2.0 XML into it. */
export async function createModelerFromXml(
  xml: string,
  options: CreateModelerOptions = {}
): Promise<any> {
  const modeler = createModeler(options);

  const result = await modeler.importXML(xml);
  const warnings: unknown[] = (result && (result as any).warnings) || [];
  if (warnings.length > 0) {
    if (options.onWarning) {
      options.onWarning(warnings);
    } else {
      console.error(`[bpmn-to-image] ${warnings.length} warning(s) while importing BPMN XML`);
    }
  }

  return modeler;
}
