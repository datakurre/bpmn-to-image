import { describe, expect, test } from 'vitest';
import {
  getPointAtLengthOnPolyline,
  getPolylineLength,
  parseSvgPolylinePoints,
} from '../src/headless-path';

describe('parseSvgPolylinePoints', () => {
  test('parses an M/L-only path', () => {
    expect(parseSvgPolylinePoints('M 0 0 L 100 0 L 100 50')).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  test('returns null for paths containing curves', () => {
    expect(parseSvgPolylinePoints('M 0 0 C 10 10 20 20 30 30')).toBeNull();
  });

  test('returns null for an empty path', () => {
    expect(parseSvgPolylinePoints('')).toBeNull();
  });
});

describe('getPolylineLength / getPointAtLengthOnPolyline', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  test('computes total length across segments', () => {
    expect(getPolylineLength(points)).toBe(200);
  });

  test('interpolates within the first segment', () => {
    expect(getPointAtLengthOnPolyline(points, 50)).toEqual({ x: 50, y: 0 });
  });

  test('interpolates within the second segment', () => {
    expect(getPointAtLengthOnPolyline(points, 150)).toEqual({ x: 100, y: 50 });
  });

  test('clamps to the start for negative length', () => {
    expect(getPointAtLengthOnPolyline(points, -10)).toEqual({ x: 0, y: 0 });
  });

  test('clamps to the end for out-of-range length', () => {
    expect(getPointAtLengthOnPolyline(points, 1000)).toEqual({ x: 100, y: 100 });
  });
});
