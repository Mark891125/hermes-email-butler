import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/adapters/cli/index.ts', 'src/adapters/api/server.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  dts: false,
  sourcemap: true
});
