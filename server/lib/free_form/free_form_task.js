import { FAIL_EVERY } from '../../../constants';
import { sendAlert } from './send_alert';

let failIndex = 0; // server-wide

export function runFreeformTask({ kbnServer, taskInstance }) {
  const { server } = kbnServer;
  const { callWithRequest } = server.plugins.elasticsearch.getCluster('data');

  const { notificationService } = server.plugins.notifications;
  const loggerAction = notificationService.getActionForId('xpack-notifications-logger');

  return async () => {
    const { params, state } = taskInstance;
    const { index, query, headers, threshold, failMe } = params;
    const runs = state.runs || 0;

    failIndex++;
    if (failMe && failIndex % FAIL_EVERY === 0) {
      throw new Error(`Failing "${taskInstance.id}": it is configured to fail!`);
    }

    const nextRuns = runs + 1;
    try {
      // FIXME this uses credentials stored in plaintext lol
      const results = await callWithRequest({ headers }, 'search', {
        index,
        body: { query: { query_string: { query } } },
      });
      const hits = results.hits;

      if (hits.total.value >= threshold) {
        await loggerAction.performAction({
          message: `${taskInstance.id} hit its threshold! Hits: ${
            hits.total.value
          } Threshold: ${threshold}`,
        });
        await sendAlert(server, hits, params, state);
      }

      return {
        state: { ran: true, runs: nextRuns, hits_total: hits.total.value },
      };
    } catch (err) {
      return {
        state: { ran: false, runs: nextRuns, error: err.message },
      };
    }
  };
}
