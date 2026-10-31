import { describe, expect, it } from 'vitest';
import { capabilitySummary, listCapabilities } from './capabilities';
import { toolInfo } from './tools';

describe('capability discovery', () => {
  it('lists every installed public tool and local actions', () => {
    const ids = listCapabilities().map((tool) => tool.id);
    for (const tool of toolInfo) expect(ids).toContain(tool.id);
    expect(ids).toContain('rename_conversation');
    expect(ids).toContain('capabilities');
    expect(capabilitySummary()).toContain('Convert 100 USD to CAD');
    expect(capabilitySummary()).toContain('cannot transfer money');
  });
});
