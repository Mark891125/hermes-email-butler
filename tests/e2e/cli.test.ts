import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

describe('CLI', () => {
  it('prints health as JSON', async () => {
    const { stdout } = await execa('bun', ['run', 'dev', '--', 'health']);

    const payload = JSON.parse(stdout);
    expect(payload).toMatchObject({ ok: true, service: 'hermes-data-gateway' });
  });

  it('runs the mock collect, generate, and latest report flow', async () => {
    const collect = await execa('bun', ['run', 'dev', '--', 'mails', 'collect', '--since', '24h', '--provider', 'mock']);
    const collectPayload = JSON.parse(collect.stdout);

    const generate = await execa('bun', ['run', 'dev', '--', 'reports', 'generate', '--source', 'mock']);
    const generatePayload = JSON.parse(generate.stdout);

    const latest = await execa('bun', ['run', 'dev', '--', 'reports', 'latest']);
    const latestPayload = JSON.parse(latest.stdout);

    expect(collectPayload.processedCount).toBeGreaterThan(0);
    expect(generatePayload.report.title).toContain('mock');
    expect(latestPayload.report.id).toBe(generatePayload.report.id);
  });
});
