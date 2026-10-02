import { getBusinessObject, is, isAny } from 'bpmn-js/lib/util/ModelUtil';
import { isLabel } from 'bpmn-js/lib/util/LabelUtil';
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ShapeLike } from 'diagram-js/lib/model/Types';
import { append as svgAppend, attr as svgAttr, create as svgCreate } from 'tiny-svg';

/**
 * Higher than `RobotTaskRenderer`'s 1500 (see `../robot/renderer.ts`): an
 * explicitly configured element template icon should win over the robot
 * renderer's id-matching heuristic when both apply to the same element.
 */
const HIGH_PRIORITY = 1600;
const ICON_SIZE = 18;

/**
 * Moddle properties checked, in order, for an element template's icon.
 * Camunda 7 and Operaton apply element templates the same way bpmn-js's
 * modeler does for Zeebe, but persist the resolved icon under their own
 * vendor namespace rather than `zeebe:modelerTemplateIcon`.
 */
const DEFAULT_ICON_PROPERTIES = ['camunda:modelerTemplateIcon', 'operaton:modelerTemplateIcon'];

/** Shape types bpmn-js's own renderer draws an icon on, in lookup order. */
const ICON_HOST_TYPES = [
  'bpmn:BoundaryEvent',
  'bpmn:CallActivity',
  'bpmn:EndEvent',
  'bpmn:IntermediateCatchEvent',
  'bpmn:IntermediateThrowEvent',
  'bpmn:StartEvent',
  'bpmn:Task',

  // specialized subprocess types before the general bpmn:SubProcess
  'bpmn:AdHocSubProcess',
  'bpmn:Transaction',
  'bpmn:SubProcess',
];

export interface ElementTemplateIconRendererConfig {
  /** Moddle property, or properties checked in order, to read the icon from. */
  iconProperty?: string | string[];
}

interface BpmnRenderer {
  handlers: Record<
    string,
    (parent: SVGElement, element: ShapeLike, attrs?: Record<string, unknown>) => SVGElement
  >;
}

/**
 * Draws an element template's icon on tasks/events instead of the default
 * bpmn-js shape icon, mirroring `@bpmn-io/element-template-icon-renderer`
 * but checking a configurable list of moddle properties rather than a
 * single hardcoded one.
 */
export default class ElementTemplateIconRenderer extends BaseRenderer {
  static $inject = ['config.elementTemplateIconRenderer', 'bpmnRenderer', 'eventBus'];

  private bpmnRenderer: BpmnRenderer;
  private iconProperties: string[];

  constructor(
    config: ElementTemplateIconRendererConfig | undefined,
    bpmnRenderer: BpmnRenderer,
    eventBus: EventBus
  ) {
    super(eventBus, HIGH_PRIORITY);
    this.bpmnRenderer = bpmnRenderer;
    const configured = config?.iconProperty;
    this.iconProperties = Array.isArray(configured)
      ? configured
      : configured
        ? [configured]
        : DEFAULT_ICON_PROPERTIES;
  }

  canRender(element: ShapeLike): boolean {
    if (isLabel(element)) {
      return false;
    }
    return !!(isAny(element, ['bpmn:Activity', 'bpmn:Event']) && this.getIcon(element));
  }

  drawShape(parentGfx: SVGElement, element: ShapeLike): SVGElement {
    const handlerType = ICON_HOST_TYPES.find((type) => is(element, type));
    const renderer = handlerType ? this.bpmnRenderer.handlers[handlerType] : undefined;
    const gfx = renderer?.(parentGfx, element, { renderIcon: false }) ?? parentGfx;

    const icon = this.getIcon(element);
    const padding = is(element, 'bpmn:Activity')
      ? { x: 5, y: 5 }
      : { x: (element.width - ICON_SIZE) / 2, y: (element.height - ICON_SIZE) / 2 };

    const img = svgCreate('image');
    svgAttr(img, { href: icon, width: ICON_SIZE, height: ICON_SIZE, ...padding });
    svgAppend(parentGfx, img);

    return gfx;
  }

  private getIcon(element: ShapeLike): string | undefined {
    const businessObject = getBusinessObject(element);
    for (const property of this.iconProperties) {
      const value = businessObject.get(property);
      if (value) {
        return value;
      }
    }
    return undefined;
  }
}
