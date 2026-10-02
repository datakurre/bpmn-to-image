/**
 * Headless BpmnModeler construction.
 *
 * Wraps `createHeadlessCanvas` with the moddle extensions needed to import
 * real-world BPMN files (Camunda 7 / Operaton extension attributes are
 * common even in diagrams that don't otherwise use Camunda features).
 */

import camundaModdle from 'camunda-bpmn-moddle/resources/camunda.json';
import { createHeadlessCanvas, getBpmnModeler } from './headless-canvas';
import ElementTemplateIconRendererModule from './element-template-icon';
import RobotModule from './robot';

const MODELER_TEMPLATE_ICON_PROPERTY = 'modelerTemplateIcon';

/**
 * The published `camunda-bpmn-moddle` schema doesn't declare
 * `modelerTemplateIcon` (or any other custom icon property a caller might
 * pick via `elementTemplateIconProperty`) on `TemplateSupported` (only
 * `modelerTemplate` and `modelerTemplateVersion`), even though Camunda
 * Modeler does write `modelerTemplateIcon` onto elements an element
 * template was applied to. `ElementTemplateIconRenderer` can still read an
 * undeclared attribute off the business object fine (bpmn-moddle falls
 * back to `$attrs` for those), but bpmn-moddle logs an import warning for
 * every attribute it doesn't recognize on a known (`camunda:`) namespace.
 * Declaring the property here avoids that warning.
 */
function withExtraTemplateSupportedProperties(
  moddle: Record<string, unknown>,
  propertyNames: string[]
): Record<string, unknown> {
  const patched = structuredClone(moddle) as {
    types: Array<{ name: string; properties?: Array<Record<string, unknown>> }>;
  };
  const templateSupported = patched.types.find((type) => type.name === 'TemplateSupported');
  for (const name of propertyNames) {
    templateSupported?.properties?.push({ name, isAttr: true, type: 'String' });
  }
  return patched;
}

/**
 * Moddle extensions registered on every modeler instance by default.
 * Exported so other headless-rendering entry points (e.g.
 * `token-simulation/simulate.ts`, which builds its own `BpmnModeler`
 * instead of going through `createModeler`) can register the same patched
 * `camunda` schema instead of the unpatched one.
 */
export const DEFAULT_MODDLE_EXTENSIONS = {
  camunda: withExtraTemplateSupportedProperties(camundaModdle, [MODELER_TEMPLATE_ICON_PROPERTY]),
};

/**
 * `camunda:`-namespaced property names from `elementTemplateIconProperty`
 * that still need declaring on the patched schema (anything other than the
 * `modelerTemplateIcon` default already baked into
 * `DEFAULT_MODDLE_EXTENSIONS`), so a caller-supplied property name doesn't
 * trigger the same "unknown attribute" import warning.
 */
function extraCamundaIconProperties(elementTemplateIconProperty: string | string[] | undefined): string[] {
  const properties = Array.isArray(elementTemplateIconProperty)
    ? elementTemplateIconProperty
    : elementTemplateIconProperty
      ? [elementTemplateIconProperty]
      : [];
  return properties
    .filter((property) => property.startsWith('camunda:'))
    .map((property) => property.slice('camunda:'.length))
    .filter((name) => name !== MODELER_TEMPLATE_ICON_PROPERTY);
}

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
   * Register the element template icon renderer, which draws an element
   * template's icon on tasks/events instead of the default bpmn-js shape
   * icon. It reads the icon (a URL or data URI) from a moddle property on
   * the element — by default `camunda:modelerTemplateIcon`, falling back to
   * `operaton:modelerTemplateIcon` — so it's a no-op unless the imported
   * XML carries one of those. Default: true.
   */
  elementTemplateIcons?: boolean;
  /**
   * Moddle property, or properties checked in order, to read the element
   * template icon from, overriding the `camunda:modelerTemplateIcon` /
   * `operaton:modelerTemplateIcon` defaults above. Only meaningful when
   * `elementTemplateIcons` isn't `false`.
   */
  elementTemplateIconProperty?: string | string[];
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
  const extraCamundaProperties = extraCamundaIconProperties(options.elementTemplateIconProperty);
  const moddleExtensions = {
    ...DEFAULT_MODDLE_EXTENSIONS,
    ...(extraCamundaProperties.length > 0
      ? {
          camunda: withExtraTemplateSupportedProperties(
            DEFAULT_MODDLE_EXTENSIONS.camunda,
            extraCamundaProperties
          ),
        }
      : {}),
    ...options.moddleExtensions,
  };
  const additionalModules = [
    ...(options.robot === false ? [] : [RobotModule]),
    ...(options.elementTemplateIcons === false ? [] : [ElementTemplateIconRendererModule]),
    ...(options.additionalModules ?? []),
  ];
  return new BpmnModeler({
    container,
    additionalModules,
    moddleExtensions,
    ...(options.elementTemplateIconProperty
      ? { elementTemplateIconRenderer: { iconProperty: options.elementTemplateIconProperty } }
      : {}),
  });
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
