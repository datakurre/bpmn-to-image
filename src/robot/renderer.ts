import { is } from 'bpmn-js/lib/util/ModelUtil';
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { ElementLike } from 'diagram-js/lib/core/Types';
import { append as svgAppend, create as svgCreate } from 'tiny-svg';

import Robot from './robot-framework.svg';

const HIGH_PRIORITY = 1500;

type BaseElement = ElementLike;

/** BPMN renderer interface with shape handlers */
interface BpmnRenderer {
  handlers: Record<string, (parent: SVGElement, element: BaseElement) => SVGElement>;
  getShapePath?: (element: BaseElement) => string;
}

export default class RobotTaskRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'bpmnRenderer'];

  private bpmnRenderer: BpmnRenderer;

  constructor(eventBus: EventBus, bpmnRenderer: BpmnRenderer) {
    super(eventBus, HIGH_PRIORITY);
    this.bpmnRenderer = bpmnRenderer;
  }

  canRender(element: BaseElement): boolean {
    return is(element, 'bpmn:ServiceTask') && /robot/i.test(element.id);
  }

  drawShape(parent: SVGElement, element: BaseElement): SVGElement {
    const shape = this.bpmnRenderer.handlers['bpmn:Task']?.(parent, element);
    const gfx = svgCreate('image', {
      x: -1,
      y: -1,
      width: 32,
      height: 32,
      href: Robot,
    }) as SVGElement;
    svgAppend(parent, gfx);
    return shape ?? gfx;
  }

  getShapePath(element: BaseElement): string {
    return this.bpmnRenderer.getShapePath?.(element) ?? '';
  }
}
