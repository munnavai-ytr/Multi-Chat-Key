import { RiskClass } from './types';

export function isInsideWorkspace(
  targetPath: string,
  cwd: string = '/',
  workspaceRoot: string = '/workspace'
): boolean {
  if (!targetPath) return true;
  let normalized = targetPath;
  if (normalized.startsWith('~')) {
    normalized = workspaceRoot + normalized.slice(1);
  } else if (!normalized.startsWith('/')) {
    normalized = (cwd.endsWith('/') ? cwd : cwd + '/') + normalized;
  }

  // Resolve . and ..
  const parts = normalized.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  const resolved = '/' + stack.join('/');
  const root = workspaceRoot.endsWith('/') ? workspaceRoot.slice(0, -1) : workspaceRoot;

  return resolved === root || resolved.startsWith(root + '/');
}

export interface SplitResult {
  segments: string[];
  pipesToShell: boolean;
}

export function splitCommands(cmdLine: string): SplitResult {
  if (!cmdLine || !cmdLine.trim()) {
    return { segments: [], pipesToShell: false };
  }

  const segments: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let pipesToShell = false;

  const len = cmdLine.length;
  let i = 0;

  while (i < len) {
    const char = cmdLine[i];
    const nextChar = cmdLine[i + 1] || '';

    if (escaped) {
      current += char;
      escaped = false;
      i++;
      continue;
    }

    if (char === '\\' && !inSingle) {
      escaped = true;
      current += char;
      i++;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      current += char;
      i++;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      current += char;
      i++;
      continue;
    }

    // Process subshell $(...) or `...`
    if (!inSingle) {
      if (char === '$' && nextChar === '(') {
        // Find closing parenthesis matching subshell
        let depth = 1;
        let j = i + 2;
        let subContent = '';
        while (j < len && depth > 0) {
          if (cmdLine[j] === '(') depth++;
          else if (cmdLine[j] === ')') depth--;
          if (depth > 0) subContent += cmdLine[j];
          j++;
        }
        if (subContent.trim()) {
          const subSplit = splitCommands(subContent);
          segments.push(...subSplit.segments);
          if (subSplit.pipesToShell) pipesToShell = true;
        }
        current += cmdLine.slice(i, j);
        i = j;
        continue;
      }

      if (char === '`') {
        let j = i + 1;
        let subContent = '';
        while (j < len && cmdLine[j] !== '`') {
          subContent += cmdLine[j];
          j++;
        }
        if (subContent.trim()) {
          const subSplit = splitCommands(subContent);
          segments.push(...subSplit.segments);
          if (subSplit.pipesToShell) pipesToShell = true;
        }
        current += cmdLine.slice(i, j + 1);
        i = j + 1;
        continue;
      }
    }

    // Process separators outside quotes: ;, &&, ||, |, \n
    if (!inSingle && !inDouble) {
      if (
        (char === '&' && nextChar === '&') ||
        (char === '|' && nextChar === '|')
      ) {
        if (current.trim()) segments.push(current.trim());
        current = '';
        i += 2;
        continue;
      }

      if (char === '|' && nextChar !== '|') {
        if (current.trim()) segments.push(current.trim());
        current = '';

        // Check if piping into sh/bash/zsh/python/node
        const remainder = cmdLine.slice(i + 1).trim();
        const nextCmdWord = remainder.split(/\s+/)[0]?.toLowerCase() || '';
        if (['sh', 'bash', 'zsh', 'python', 'python3', 'node', 'sudo'].includes(nextCmdWord)) {
          pipesToShell = true;
        }
        i++;
        continue;
      }

      if (char === ';' || char === '\n' || char === '\r') {
        if (current.trim()) segments.push(current.trim());
        current = '';
        i++;
        continue;
      }
    }

    current += char;
    i++;
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  return { segments, pipesToShell };
}

export interface ClassifyResult {
  classes: Set<RiskClass>;
  reasons: string[];
  blocked?: string;
}

const READ_CMDS = new Set([
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'rg',
  'find',
  'tree',
  'stat',
  'file',
  'pwd',
  'echo',
  'printf',
  'sort',
  'uniq',
  'cut',
  'tr',
  'diff',
  'jq',
  'which',
  'type',
  'date',
  'uname',
  'du',
  'df',
  'ps',
  'top',
]);

const WRITE_CMDS = new Set([
  'touch',
  'mkdir',
  'cp',
  'mv',
  'tee',
  'node',
  'python',
  'python3',
  'tsc',
  'esbuild',
  'make',
  'go',
  'cargo',
]);

const INSTALL_CMDS = new Set([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'pip',
  'pip3',
  'uv',
  'apt',
  'apt-get',
  'apk',
  'brew',
  'gem',
  'composer',
]);

const NETWORK_CMDS = new Set([
  'curl',
  'wget',
  'nc',
  'ncat',
  'ssh',
  'scp',
  'sftp',
  'ftp',
  'telnet',
  'ping',
  'dig',
  'nslookup',
  'docker',
]);

const PRIVILEGED_CMDS = new Set([
  'sudo',
  'su',
  'doas',
  'mount',
  'umount',
  'systemctl',
  'service',
  'iptables',
  'useradd',
  'passwd',
  'reboot',
  'shutdown',
]);

const SECRET_PATHS = [
  '~/.ssh',
  '~/.aws',
  '~/.config',
  '~/.npmrc',
  '~/.git-credentials',
  '/etc/shadow',
  '/proc/',
];

export function classify(
  cmdLine: string,
  ctx: { workspaceRoot: string; userApprovedPipesToShell?: boolean }
): ClassifyResult {
  const classes = new Set<RiskClass>();
  const reasons: string[] = [];

  const workspaceRoot = ctx.workspaceRoot || '/workspace';

  // 1. Hard Block Checks
  if (/:(\(\)\s*\{|:\s*\|\s*:|&)/.test(cmdLine)) {
    return {
      classes: new Set(['destructive', 'privileged']),
      reasons: ['Fork bomb detected'],
      blocked: 'Fork bomb command pattern blocked',
    };
  }

  // Dangerous rm -rf targeting root or home or wildcards
  if (/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+(\/|~\b|\/\*|\.\.\b|\*)/i.test(cmdLine)) {
    return {
      classes: new Set(['destructive']),
      reasons: ['Destructive rm -rf targeting root or home directory'],
      blocked: 'Destructive command rm -rf / or ~ blocked',
    };
  }

  if (/\bmkfs(\.[a-z0-9]+)?\s+/i.test(cmdLine)) {
    return {
      classes: new Set(['destructive', 'privileged']),
      reasons: ['Format disk command mkfs detected'],
      blocked: 'Disk formatting command mkfs blocked',
    };
  }

  if (/\bdd\s+.*of=\/dev\/(sd|hd|nvme|vd)/i.test(cmdLine) || />\s*\/dev\/(sd|hd|nvme|vd)/i.test(cmdLine)) {
    return {
      classes: new Set(['destructive', 'privileged']),
      reasons: ['Direct disk overwrite detected'],
      blocked: 'Direct device overwrite blocked',
    };
  }

  if (/chmod\s+(-R\s+)?777\s+(\/|~\b|\/\*)/i.test(cmdLine)) {
    return {
      classes: new Set(['destructive', 'privileged']),
      reasons: ['Recursive chmod 777 on root or home'],
      blocked: 'Unsafe recursive chmod 777 / blocked',
    };
  }

  const splitRes = splitCommands(cmdLine);

  if (splitRes.pipesToShell && !ctx.userApprovedPipesToShell) {
    classes.add('destructive');
    reasons.push('Piping remote scripts directly to shell (curl/wget | sh/bash)');
    return {
      classes,
      reasons,
      blocked: 'Piping remote content to shell execution (curl | sh) requires explicit user approval',
    };
  }

  for (const rawSegment of splitRes.segments) {
    let seg = rawSegment.trim();
    if (!seg) continue;

    // Check environment assignment wrappers (e.g., FOO=1 BAR=2 cmd)
    const envAssignments: string[] = [];
    while (/^[A-Za-z_][A-Za-z0-9_]*=\S+/.test(seg)) {
      const match = seg.match(/^([A-Za-z_][A-Za-z0-9_]*)=\S+/);
      if (match) {
        envAssignments.push(match[1]);
        seg = seg.slice(match[0].length).trim();
      } else {
        break;
      }
    }

    // Check export containing sensitive tokens
    if (seg.startsWith('export ')) {
      const varName = seg.slice(7).split('=')[0]?.trim().toUpperCase() || '';
      if (['KEY', 'TOKEN', 'SECRET', 'PASSWORD', 'AUTH'].some((k) => varName.includes(k))) {
        classes.add('secret');
        reasons.push(`export of sensitive variable ${varName}`);
      }
    }

    // Check wrappers like sudo, env, time, nice
    let isPrivilegedWrapper = false;
    while (/^(sudo|env|time|nice|nohup|doas)\s+/.test(seg)) {
      if (seg.startsWith('sudo ') || seg.startsWith('doas ')) {
        isPrivilegedWrapper = true;
      }
      seg = seg.replace(/^(sudo|env|time|nice|nohup|doas)\s+/, '').trim();
    }

    if (isPrivilegedWrapper) {
      classes.add('privileged');
      reasons.push('uses elevated privileges (sudo)');
    }

    if (!seg) continue;

    // First word is executable name
    const tokens = seg.split(/\s+/);
    const mainCmd = tokens[0]?.toLowerCase() || '';

    // Check for secret file access in arguments
    for (const secretPath of SECRET_PATHS) {
      if (seg.includes(secretPath)) {
        classes.add('secret');
        reasons.push(`accesses sensitive path ${secretPath}`);
      }
    }
    if (/\.env(\.local|\.production|\.development)?\b/.test(seg)) {
      const envPathMatch = seg.match(/\S*\.env\S*/);
      if (envPathMatch && !isInsideWorkspace(envPathMatch[0], '/', workspaceRoot)) {
        classes.add('secret');
        reasons.push('accesses environment file outside workspace');
      }
    }

    // Check SQL drop/truncate
    if (/\b(drop|truncate)\s+(table|database|schema)\b/i.test(seg)) {
      classes.add('destructive');
      reasons.push('SQL DROP or TRUNCATE operation');
    }

    // Check output redirection > or >>
    const redirectMatch = seg.match(/(>|>>)\s*(\S+)/);
    if (redirectMatch) {
      const targetPath = redirectMatch[2].replace(/^["']|["']$/g, '');
      if (!isInsideWorkspace(targetPath, '/', workspaceRoot)) {
        classes.add('destructive');
        reasons.push(`output redirection outside workspace (${targetPath})`);
      } else {
        classes.add('write');
        reasons.push(`file redirection inside workspace (${targetPath})`);
      }
    }

    // Check specific commands
    if (mainCmd === 'rm' || mainCmd === 'rmdir') {
      const hasRecOrForce = tokens.some((t) => t.startsWith('-') && (t.includes('r') || t.includes('f')));
      const targetsOut = tokens.slice(1).some((t) => !t.startsWith('-') && !isInsideWorkspace(t, '/', workspaceRoot));
      if (hasRecOrForce || targetsOut) {
        classes.add('destructive');
        reasons.push(`destructive remove (${seg})`);
      } else {
        classes.add('write');
        reasons.push('remove file');
      }
    } else if (mainCmd === 'git') {
      const subCmd = tokens[1]?.toLowerCase() || '';
      if (subCmd === 'clone' || subCmd === 'fetch' || subCmd === 'pull' || subCmd === 'push') {
        classes.add('network');
        reasons.push(`git network operation (${subCmd})`);
      }
      if (subCmd === 'add' || subCmd === 'commit' || subCmd === 'checkout' || subCmd === 'branch' || subCmd === 'merge' || subCmd === 'stash') {
        classes.add('write');
        reasons.push(`git repo modification (${subCmd})`);
      }
      if (seg.includes('reset --hard') || seg.includes('clean -fd') || seg.includes('push --force') || seg.includes('push -f') || seg.includes('branch -D')) {
        classes.add('destructive');
        reasons.push(`destructive git operation (${seg})`);
      }
    } else if (INSTALL_CMDS.has(mainCmd)) {
      const subCmd = tokens[1]?.toLowerCase() || '';
      if (['install', 'i', 'add', 'get'].includes(subCmd) || mainCmd === 'pip' || mainCmd === 'pip3' || mainCmd === 'apt' || mainCmd === 'brew') {
        classes.add('install');
        reasons.push(`package installation (${mainCmd} ${subCmd})`);
      } else if (subCmd === 'run') {
        classes.add('write');
        reasons.push(`package script execution (${mainCmd} run)`);
      } else if (subCmd === 'publish') {
        classes.add('network');
        classes.add('write');
        reasons.push('publishing package');
      } else {
        classes.add('write');
        reasons.push(`package tool invocation (${mainCmd})`);
      }
    } else if (NETWORK_CMDS.has(mainCmd)) {
      classes.add('network');
      reasons.push(`network tool (${mainCmd})`);
    } else if (PRIVILEGED_CMDS.has(mainCmd)) {
      classes.add('privileged');
      reasons.push(`system/privileged command (${mainCmd})`);
    } else if (mainCmd === 'env' || mainCmd === 'printenv') {
      if (tokens.length === 1) {
        classes.add('secret');
        reasons.push('inspecting environment variables');
      }
    } else if (mainCmd === 'set' && tokens.length === 1) {
      classes.add('secret');
      reasons.push('inspecting shell environment');
    } else if (mainCmd === 'sed' && tokens.includes('-i')) {
      classes.add('write');
      reasons.push('in-place file edit (sed -i)');
    } else if (READ_CMDS.has(mainCmd)) {
      if (!redirectMatch) {
        classes.add('read');
        reasons.push(`read operation (${mainCmd})`);
      }
    } else if (WRITE_CMDS.has(mainCmd)) {
      classes.add('write');
      reasons.push(`write operation (${mainCmd})`);
    } else {
      // Unknown command defaults to write
      classes.add('write');
      reasons.push(`unknown command (${mainCmd})`);
    }
  }

  if (classes.size === 0) {
    classes.add('read');
    reasons.push('read operation');
  }

  return { classes, reasons };
}
