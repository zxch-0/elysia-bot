import type { ElysiaClient } from '../core/client';
import { logger } from '../core/logger';
import { confirmationModule } from './confirmationModule';
import { panelRoleModule } from './panelModule';
import { giveawayModule } from './giveawayModule';
import { helpModule } from './helpModule';
import { caseModule } from './caseModule';
import { embedBuilderModule } from './embedModule';

const log = logger.child('modules');

/** Enregistre tous les modules d'interaction sur le client. */
export function registerInteractionModules(client: ElysiaClient): void {
  const modules = [confirmationModule, panelRoleModule, giveawayModule, embedBuilderModule, helpModule, caseModule];
  for (const module of modules) client.registerModule(module);
  log.success(`${modules.length} modules d'interaction chargés (${modules.map((m) => m.prefix).join(', ')})`);
}
