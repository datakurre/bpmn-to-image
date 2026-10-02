import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { renderToSvg } from '../src/render';
import ElementTemplateIconRendererModule, {
  ElementTemplateIconRenderer,
} from '../src/element-template-icon';

const sampleXml = readFileSync(join(__dirname, 'fixtures/sample.bpmn'), 'utf-8');
const camundaIconXml = readFileSync(
  join(__dirname, 'fixtures/element-template-icon.bpmn'),
  'utf-8'
);
const operatonIconXml = readFileSync(
  join(__dirname, 'fixtures/element-template-icon-operaton.bpmn'),
  'utf-8'
);

const ICON_DATA_URI =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';

describe('element template icon renderer', () => {
  test('exports module definitions properly', () => {
    expect(ElementTemplateIconRendererModule.__init__).toContain('elementTemplateIconRenderer');
    expect(ElementTemplateIconRendererModule.elementTemplateIconRenderer).toEqual([
      'type',
      ElementTemplateIconRenderer,
    ]);
  });

  test('renders the icon from camunda:modelerTemplateIcon by default', async () => {
    const svg = await renderToSvg(camundaIconXml, { robot: false });
    expect(svg).toContain('<image');
    expect(svg).toContain(ICON_DATA_URI);
  });

  test('renders the icon from operaton:modelerTemplateIcon by default', async () => {
    const svg = await renderToSvg(operatonIconXml, { robot: false });
    expect(svg).toContain('<image');
    expect(svg).toContain(ICON_DATA_URI);
  });

  test('does not render an icon for diagrams without a template icon property', async () => {
    const svg = await renderToSvg(sampleXml, { robot: false });
    expect(svg).not.toContain('<image');
  });

  test('elementTemplateIcons: false disables icon rendering even when the property is present', async () => {
    const svg = await renderToSvg(camundaIconXml, { robot: false, elementTemplateIcons: false });
    expect(svg).not.toContain(ICON_DATA_URI);
  });

  test('elementTemplateIconProperty overrides the default properties entirely', async () => {
    // With the default camunda:/operaton: fallback overridden, a camunda-icon
    // fixture should no longer render its icon.
    const svg = await renderToSvg(camundaIconXml, {
      robot: false,
      elementTemplateIconProperty: 'operaton:modelerTemplateIcon',
    });
    expect(svg).not.toContain(ICON_DATA_URI);
  });

  test('elementTemplateIconProperty accepts a custom property name', async () => {
    const xml = operatonIconXml.replace(
      `operaton:modelerTemplateIcon="${ICON_DATA_URI}"`,
      `operaton:customIcon="${ICON_DATA_URI}"`
    );
    const svg = await renderToSvg(xml, {
      robot: false,
      elementTemplateIconProperty: 'operaton:customIcon',
    });
    expect(svg).toContain(ICON_DATA_URI);
  });

  test('a custom camunda: property name renders the icon without an import warning', async () => {
    const xml = camundaIconXml.replace(
      `camunda:modelerTemplateIcon="${ICON_DATA_URI}"`,
      `camunda:customIcon="${ICON_DATA_URI}"`
    );
    const warnings: unknown[] = [];
    const svg = await renderToSvg(xml, {
      robot: false,
      elementTemplateIconProperty: 'camunda:customIcon',
      onWarning: (w) => warnings.push(...w),
    });
    expect(svg).toContain(ICON_DATA_URI);
    expect(warnings).toEqual([]);
  });
});
