import { db } from './db';
import { TOOLS, ToolDef } from './tools';

export async function getEnabledTools(chat?: { workspaceId?: string }): Promise<ToolDef[]> {
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

  const dr = (await db.meta.get('tool:deep_research'))?.value ?? true;
  if (dr && TOOLS.deep_research) {
    const searchKey = (await db.meta.get('searchKey'))?.value;
    if (searchKey && searchKey.ct) {
      enabled.push(TOOLS.deep_research);
    }
  }

  const ca = (await db.meta.get('tool:create_artifact'))?.value ?? true;
  if (ca) enabled.push(TOOLS.create_artifact);

  const rc = (await db.meta.get('tool:run_code'))?.value ?? true;
  if (rc) enabled.push(TOOLS.run_code);

  const rem = (await db.meta.get('tool:remember'))?.value ?? true;
  if (rem) enabled.push(TOOLS.remember);

  const sc = (await db.meta.get('tool:search_chats'))?.value ?? true;
  if (sc && TOOLS.search_chats) enabled.push(TOOLS.search_chats);

  const fg = (await db.meta.get('tool:forget'))?.value ?? true;
  if (fg && TOOLS.forget) enabled.push(TOOLS.forget);

  const cd = (await db.meta.get('tool:create_document'))?.value ?? true;
  if (cd && TOOLS.create_document) enabled.push(TOOLS.create_document);

  if (chat?.workspaceId) {
    if (TOOLS.list_files) enabled.push(TOOLS.list_files);
    if (TOOLS.read_file) enabled.push(TOOLS.read_file);
    if (TOOLS.search_code) enabled.push(TOOLS.search_code);
    if (TOOLS.edit_file) enabled.push(TOOLS.edit_file);
    if (TOOLS.create_file) enabled.push(TOOLS.create_file);
    if (TOOLS.delete_file) enabled.push(TOOLS.delete_file);
    if (TOOLS.check_syntax) enabled.push(TOOLS.check_syntax);
    if (TOOLS.check_project) enabled.push(TOOLS.check_project);
    if (TOOLS.check_imports) enabled.push(TOOLS.check_imports);
    if (TOOLS.update_plan) enabled.push(TOOLS.update_plan);
  }

  const STATUS_PARAM_PROPERTY = {
    type: 'string',
    description:
      "Shown to the user while this step runs: 3 to 6 words, present tense, in the SAME LANGUAGE as the user's latest message, describing exactly this action (for example 'Reading AppShell.tsx' or 'ওয়েবে খুঁজছি: ...'). Do not add steps that you are not doing.",
  };

  return enabled.map((t) => ({
    ...t,
    parameters: {
      ...t.parameters,
      type: t.parameters?.type || 'object',
      properties: {
        ...(t.parameters?.properties || {}),
        status: STATUS_PARAM_PROPERTY,
      },
    },
  }));
}

export function toolLabel(c: { name: string; args: any }) {
  if (c.name === 'deep_research') return `Deep Research: ${c.args?.question?.slice(0, 35) || 'investigating'}`;
  if (c.name === 'web_search') return `Searching: ${c.args?.query || ''}`;
  if (c.name === 'create_artifact') return `Creating: ${c.args?.title || 'Artifact'}`;
  if (c.name === 'run_code') return `Running ${c.args?.language || 'code'}`;
  if (c.name === 'remember') return 'Saving to memory';
  if (c.name === 'search_chats') return `Searching chats: ${c.args?.query || ''}`;
  if (c.name === 'forget') return 'Forgetting';
  if (c.name === 'create_document') {
    const filename = c.args?.filename || 'document';
    const format = c.args?.format || 'file';
    return `Creating ${filename}.${format}`;
  }
  if (c.name === 'list_files') return 'Listing files';
  if (c.name === 'read_file') return `Reading ${c.args?.path || ''}`;
  if (c.name === 'search_code') return `Searching: ${c.args?.query || ''}`;
  if (c.name === 'edit_file') return `Editing ${c.args?.path || ''}`;
  if (c.name === 'create_file') return `Creating ${c.args?.path || ''}`;
  if (c.name === 'delete_file') return `Deleting ${c.args?.path || ''}`;
  if (c.name === 'check_syntax') return `Checking ${c.args?.path || ''}`;
  if (c.name === 'check_project') return `Checking project syntax${c.args?.path_prefix ? ' (' + c.args.path_prefix + ')' : ''}`;
  if (c.name === 'check_imports') return `Checking imports${c.args?.path_prefix ? ' (' + c.args.path_prefix + ')' : ''}`;
  if (c.name === 'update_plan') return 'Updating plan';
  return c.name;
}
