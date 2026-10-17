import { db } from './db';
import { TOOLS, ToolDef } from './tools';

export async function getEnabledTools(): Promise<ToolDef[]> {
  const smart = (await db.meta.get('smartMode'))?.value;
  if (smart === false) return [];

  const enabled: ToolDef[] = [];

  const ws = (await db.meta.get('tool:web_search'))?.value ?? true;
  if (ws) {
    const searchKey = (await db.meta.get('searchKey'))?.value;
    if (searchKey && searchKey.ct) {
      enabled.push(TOOLS.web_search);
    }
  }

  const ca = (await db.meta.get('tool:create_artifact'))?.value ?? true;
  if (ca) enabled.push(TOOLS.create_artifact);

  const rc = (await db.meta.get('tool:run_code'))?.value ?? true;
  if (rc) enabled.push(TOOLS.run_code);

  const rem = (await db.meta.get('tool:remember'))?.value ?? true;
  if (rem) enabled.push(TOOLS.remember);

  return enabled;
}

export function toolLabel(c: { name: string; args: any }) {
  if (c.name === 'web_search') return `Searching: ${c.args.query || ''}`;
  if (c.name === 'create_artifact') return `Creating: ${c.args.title || 'Artifact'}`;
  if (c.name === 'run_code') return `Running ${c.args.language || 'code'}`;
  if (c.name === 'remember') return 'Saving to memory';
  return c.name;
}
