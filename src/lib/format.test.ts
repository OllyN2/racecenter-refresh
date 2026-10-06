import { describe, expect, it } from 'vitest';
import { flagInfo, gap, lapTime, lastName, makeInfo, parseDriver, parseTimestamp, parseUtc, speed } from './format';

describe('lapTime', () => {
  it('formats sub-minute and over-minute laps', () => {
    expect(lapTime(30.325)).toBe('30.325');
    expect(lapTime(98.706)).toBe('1:38.706');
    expect(lapTime(61.05)).toBe('1:01.050');
  });
  it('renders missing laps as a dash', () => {
    expect(lapTime(0)).toBe('—');
    expect(lapTime(null)).toBe('—');
  });
});

describe('speed', () => {
  it('accepts numbers and numeric strings', () => {
    expect(speed(180.024)).toBe('180.024');
    expect(speed('84.118')).toBe('84.118');
    expect(speed(null)).toBe('—');
  });
});

describe('gap', () => {
  it('handles leader, time gaps and laps down', () => {
    expect(gap(0, true)).toBe('Leader');
    expect(gap(0.329, false)).toBe('+0.329');
    expect(gap(-1, false)).toBe('−1 lap');
    expect(gap(-3, false)).toBe('−3 laps');
  });
});

describe('parseDriver', () => {
  it('strips NASCAR markers into flags', () => {
    expect(parseDriver('Brent Crews # (C)')).toEqual({ name: 'Brent Crews', chase: true, rookie: true, ineligible: false });
    expect(parseDriver('Shane Van Gisbergen(i)')).toEqual({ name: 'Shane Van Gisbergen', chase: false, rookie: false, ineligible: true });
    expect(parseDriver('Jeremy Clements').name).toBe('Jeremy Clements');
  });
});

describe('lastName', () => {
  it('keeps particles and suffixes', () => {
    expect(lastName('Shane Van Gisbergen')).toBe('Van Gisbergen');
    expect(lastName('Dale Earnhardt Jr.')).toBe('Earnhardt Jr.');
    expect(lastName('Austin J Hill')).toBe('Hill');
    expect(lastName('Larson')).toBe('Larson');
  });
});

describe('timestamps', () => {
  it('parses 7-digit fractional offsets', () => {
    expect(parseTimestamp('2026-10-03T11:49:40.2574135-07:00')).toBe(Date.UTC(2026, 9, 3, 18, 49, 40, 257));
  });
  it('treats zone-less schedule times as UTC', () => {
    expect(parseUtc('2026-10-03T23:30:00')).toBe(Date.UTC(2026, 9, 3, 23, 30));
    expect(parseUtc('2026-10-03T23:30:00Z')).toBe(Date.UTC(2026, 9, 3, 23, 30));
  });
});

describe('lookups', () => {
  it('maps manufacturer codes and names', () => {
    expect(makeInfo('Chv').name).toBe('Chevrolet');
    expect(makeInfo('Toyota').short).toBe('TYT');
    expect(makeInfo('Dodge').key).toBe('other');
  });
  it('maps flag codes with a fallback', () => {
    expect(flagInfo(2).tone).toBe('yellow');
    expect(flagInfo(42).label).toBe('No flag');
  });
});
