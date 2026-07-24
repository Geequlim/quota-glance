import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
  ENVIRONMENT_ALLOWLIST,
  mergeEnvironmentSources,
  normalizeProxyVariables,
  parseEnvironmentFile,
  type RuntimeEnvironment,
} from './environment-parser.js';

const decoder = new TextDecoder();

export class EnvironmentLoader {
  load(): RuntimeEnvironment {
    const configRoot = GLib.get_user_config_dir();
    const system = readEnvironmentFile('/etc/environment');
    const environmentDirectory = readEnvironmentDirectory(
      GLib.build_filenamev([configRoot, 'environment.d']),
    );
    const session = readSessionEnvironment();
    const quotaGlance = readEnvironmentFile(
      GLib.build_filenamev([configRoot, 'quota-glance', 'env']),
    );

    return normalizeProxyVariables(
      mergeEnvironmentSources(
        system,
        ...environmentDirectory,
        session,
        quotaGlance,
      ),
    );
  }
}

function readEnvironmentDirectory(path: string): RuntimeEnvironment[] {
  try {
    const directory = Gio.File.new_for_path(path);
    const enumerator = directory.enumerate_children(
      'standard::name,standard::type',
      Gio.FileQueryInfoFlags.NONE,
      null,
    );
    const filenames: string[] = [];
    let info: Gio.FileInfo | null;
    while ((info = enumerator.next_file(null)) !== null) {
      if (
        info.get_file_type() === Gio.FileType.REGULAR &&
        info.get_name().endsWith('.conf')
      ) {
        filenames.push(info.get_name());
      }
    }
    enumerator.close(null);

    return filenames
      .sort()
      .map(filename =>
        readEnvironmentFile(GLib.build_filenamev([path, filename])));
  } catch {
    return [];
  }
}

function readEnvironmentFile(path: string): RuntimeEnvironment {
  try {
    const [ok, contents] = GLib.file_get_contents(path);
    return ok ? parseEnvironmentFile(decoder.decode(contents)) : {};
  } catch {
    return {};
  }
}

function readSessionEnvironment(): RuntimeEnvironment {
  const environment: RuntimeEnvironment = {};
  for (const key of ENVIRONMENT_ALLOWLIST) {
    const value = GLib.getenv(key);
    if (value !== null)
      environment[key] = value;
  }
  return environment;
}
